module.exports = {
    apps: [
        {
            name: "DEV_worker",
            cwd: "c:\\dev\\MLDEV\\openturn\\worker",
            script: "dist\\main.js",
            interpreter: "C:\\nvm\\v24.13.0\\node.exe",
            watch: false,
            exec_mode: "fork",
            instances: 1,
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
