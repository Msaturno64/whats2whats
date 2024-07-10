const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs").promises;
const path = require("path");

const handleMediaDownload = async (ctx, mediaType) => {
    const buffer = await downloadMediaMessage(ctx, "buffer");
    const tmpDir = path.join(process.cwd(), "tmp");
    await fs.mkdir(tmpDir, { recursive: true });

    const fileExtension = mediaType === 'image' ? 'jpg' :
        mediaType === 'video' ? 'mp4' :
            mediaType === 'document' ? ctx.message.documentMessage.mimetype.split('/')[1] :
                'unknown';

    const fileName = `media-${Date.now()}.${fileExtension}`;
    const filePath = path.join(tmpDir, fileName);

    await fs.writeFile(filePath, buffer);

    return filePath;
};

module.exports = { handleMediaDownload };

