import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'fleet_uploads');

/**
 * Ensures the upload directory exists.
 */
function ensureUploadDir() {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
}

/**
 * Saves a file to the fleet_uploads directory.
 * @param file The file to save (from a FormData)
 * @returns The relative path to the saved file
 */
export async function saveFleetFile(file: File): Promise<string> {
    ensureUploadDir();

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExtension = path.extname(file.name);
    const fileName = `${crypto.randomUUID()}${fileExtension}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    fs.writeFileSync(filePath, buffer);

    return fileName; // We only return the filename to keep it simple
}

/**
 * Deletes a file from the fleet_uploads directory.
 * @param fileName The name of the file to delete
 */
export async function deleteFleetFile(fileName: string) {
    const filePath = path.join(UPLOAD_DIR, fileName);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

/**
 * Gets the absolute path of a file.
 * Useful for serving the file via a custom route.
 */
export function getFleetFilePath(fileName: string) {
    return path.join(UPLOAD_DIR, fileName);
}
