import sharp from 'sharp';

/**
 * Resizes a base64 image to the specified width and height.
 * @param base64 The base64 string of the image (without the data:image/... prefix).
 * @param width The target width.
 * @param height The target height.
 * @returns A promise that resolves to the resized base64 string.
 */
export async function resizeBase64Image(base64: string, width: number, height: number): Promise<string> {
    if (!base64) return base64;

    try {
        const buffer = Buffer.from(base64, 'base64');
        const resizedBuffer = await sharp(buffer)
            .resize(width, height, {
                fit: 'cover',
                position: 'center'
            })
            .toBuffer();

        return resizedBuffer.toString('base64');
    } catch (error) {
        console.error('Error resizing image:', error);
        return base64; // Return original if resizing fails
    }
}
