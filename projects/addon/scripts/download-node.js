const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const NODE_VERSION = "v24.13.0";
const ROOT_DIR = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT_DIR, 'bin');

if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
}

console.log("=============================================");
console.log(` Fetching Node.js ${NODE_VERSION} binaries `);
console.log("=============================================");

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

async function main() {
    const winExe = path.join(BIN_DIR, `node-${NODE_VERSION}-win-x64.exe`);
    if (!fs.existsSync(winExe)) {
        console.log("Downloading Windows binary...");
        await downloadFile(`https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`, winExe);
    } else {
        console.log("Windows binary already exists.");
    }

    // Download NSSM for Windows service
    const nssmDest = path.join(__dirname, 'windows/nssm.exe');
    if (process.platform === 'win32' && !fs.existsSync(nssmDest)) {
        console.log("Downloading NSSM for Windows service...");
        const nssmZip = path.join(BIN_DIR, 'nssm.zip');
        // Try to download NSSM. If it fails, we'll suggest manual download.
        try {
            await downloadFile('https://nssm.cc/release/nssm-2.24.zip', nssmZip);

            // Check if file is valid (not an error page)
            const stats = fs.statSync(nssmZip);
            if (stats.size < 1000) {
                throw new Error("Downloaded file is too small, likely an error page.");
            }

            console.log("Extracting NSSM using PowerShell...");
            // Use PowerShell to unzip as it's more reliable for ZIPs on Windows
            const psCommand = `Expand-Archive -Path "${nssmZip}" -DestinationPath "${BIN_DIR}" -Force`;
            execSync(`powershell -Command "${psCommand}"`);

            fs.renameSync(path.join(BIN_DIR, 'nssm-2.24/win64/nssm.exe'), nssmDest);

            // Cleanup
            fs.unlinkSync(nssmZip);
            fs.rmSync(path.join(BIN_DIR, 'nssm-2.24'), { recursive: true, force: true });
            console.log("NSSM extracted to scripts/windows/");
        } catch (err) {
            console.error("Error with NSSM:", err.message);
            console.log("[TIP] Could not download/extract NSSM automatically.");
            console.log("Please download https://nssm.cc/release/nssm-2.24.zip manually,");
            console.log(`extract win64/nssm.exe and place it at: ${nssmDest}`);
        }
    }

    const linuxBinary = path.join(BIN_DIR, `node-${NODE_VERSION}-linux-x64`);
    if (!fs.existsSync(linuxBinary)) {
        console.log("Downloading Linux binary...");
        const tarPath = path.join(BIN_DIR, 'node.tar.gz');
        await downloadFile(`https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.gz`, tarPath);

        console.log("Extracting Linux binary (node only)...");
        try {
            const nodeFilePathInTar = `node-${NODE_VERSION}-linux-x64/bin/node`;
            execSync(`tar -xzf "${tarPath}" --strip-components=2 "${nodeFilePathInTar}"`, { cwd: BIN_DIR });
            const extractedNode = path.join(BIN_DIR, 'node');
            if (fs.existsSync(extractedNode)) {
                if (fs.existsSync(linuxBinary)) {
                    try { fs.unlinkSync(linuxBinary); } catch (e) { }
                }
                try {
                    fs.renameSync(extractedNode, linuxBinary);
                    console.log("Linux binary extracted and renamed.");
                } catch (e) {
                    console.log("Rename failed (EBUSY?), waiting 500ms...");
                    execSync('powershell "Start-Sleep -m 500"');
                    fs.renameSync(extractedNode, linuxBinary);
                    console.log("Linux binary extracted and renamed (on retry).");
                }
            }
            if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
            const leftoverDir = path.join(BIN_DIR, `node-${NODE_VERSION}-linux-x64`);
            if (fs.existsSync(leftoverDir)) fs.rmSync(leftoverDir, { recursive: true, force: true });
        } catch (err) {
            console.error("Error extracting Linux binary:", err.message);
        }
    } else {
        console.log("Linux binary already exists.");
    }

    // Try to build Windows Installer if on Windows and ISCC is found
    if (process.platform === 'win32') {
        let isccPath = 'iscc.exe';
        try {
            execSync('where iscc.exe', { stdio: 'ignore' });
        } catch (e) {
            const commonPaths = [
                'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
                'C:\\Program Files (x86)\\Inno Setup 5\\ISCC.exe'
            ];
            isccPath = commonPaths.find(p => fs.existsSync(p)) || null;
        }

        if (isccPath) {
            console.log("=============================================");
            console.log(" Generating Windows Installer (.exe) ");
            console.log("=============================================");
            const issFile = path.join(__dirname, 'windows/installer.iss');
            try {
                execSync(`"${isccPath}" "${issFile}"`, { stdio: 'inherit' });
                console.log("Installer generated successfully in dist-installers/");
            } catch (err) {
                console.error("Error running ISCC:", err.message);
            }
        } else {
            console.log("\n[TIP] Inno Setup (ISCC.exe) not found.");
            console.log("To generate the .exe installer, install Inno Setup 6 from https://jrsoftware.org/isdl.php");
        }
    }

    // Generate Linux Bundle (tar.gz)
    console.log("=============================================");
    console.log(" Generating Linux Installer (.tar.gz) ");
    console.log("=============================================");

    const distInstallersDir = path.join(ROOT_DIR, 'dist-installers');
    if (!fs.existsSync(distInstallersDir)) {
        fs.mkdirSync(distInstallersDir, { recursive: true });
    }

    const linuxTar = path.join(distInstallersDir, 'Setup-Addon.tar.gz');
    try {
        const filesToBundle = [
            'scripts/linux/install.sh',
            `bin/node-${NODE_VERSION}-linux-x64`,
            'dist/index.js'
        ];

        const missing = filesToBundle.filter(f => !fs.existsSync(path.join(ROOT_DIR, f)));
        if (missing.length === 0) {
            execSync(`tar -czf "${linuxTar}" ${filesToBundle.join(' ')}`, { cwd: ROOT_DIR });
            console.log("Linux bundle generated successfully in dist-installers/");
        } else {
            console.log("[SKIP] Linux bundle skipped because of missing files:", missing.join(', '));
        }
    } catch (err) {
        console.error("Error generating Linux bundle:", err.message);
    }

    console.log("=============================================");
    console.log(` Done. Binaries saved to ${BIN_DIR} `);
    console.log("=============================================");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
