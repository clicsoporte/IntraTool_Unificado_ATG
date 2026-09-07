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
 * Gets the absolute path of a file safely, preventing Path Traversal vulnerabilities.
 */
export function getFleetFilePath(fileName: string): string | null {
    const safeBaseName = path.basename(fileName);
    const resolvedPath = path.resolve(UPLOAD_DIR, safeBaseName);
    if (!resolvedPath.startsWith(path.resolve(UPLOAD_DIR))) {
        return null;
    }
    return resolvedPath;
}

/**
 * Saves a base64 Data URL or raw base64 string into the fleet_uploads directory.
 * Returns the generated filename or null if invalid base64.
 */
export async function saveBase64ToFleetFile(base64Data: string, prefix: string = 'img'): Promise<string | null> {
    if (!base64Data || typeof base64Data !== 'string') return null;
    ensureUploadDir();

    try {
        let extension = '.png';
        let rawBase64 = base64Data;

        if (base64Data.startsWith('data:image/')) {
            const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const ext = matches[1].toLowerCase();
                extension = `.${ext === 'jpeg' ? 'jpg' : ext}`;
                rawBase64 = matches[2];
            }
        }

        const buffer = Buffer.from(rawBase64, 'base64');
        const fileName = `${prefix}_${crypto.randomUUID()}${extension}`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        fs.writeFileSync(filePath, buffer);
        return fileName;
    } catch (err) {
        console.error('Error saving base64 to fleet file:', err);
        return null;
    }
}

