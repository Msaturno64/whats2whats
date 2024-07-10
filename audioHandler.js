const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs").promises;
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

const convertOggToMp4 = async (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioQuality(96)
            .toFormat("mp4")
            .save(outputPath)
            .on("progress", (p) => null)
            .on("end", () => {
                resolve(true);
            })
            .on("error", (err) => {
                reject(err);
            });
    });
};

const handleVoiceNoteDownload = async (ctx) => {
    const buffer = await downloadMediaMessage(ctx, "buffer");
    const tmpDir = path.join(process.cwd(), "tmp");
    await fs.mkdir(tmpDir, { recursive: true });

    const pathTmpOgg = path.join(tmpDir, `voice-note-${Date.now()}.ogg`);
    const pathTmpMp4 = path.join(tmpDir, `voice-note-${Date.now()}.mp4`);

    await fs.writeFile(pathTmpOgg, buffer);
    await convertOggToMp4(pathTmpOgg, pathTmpMp4);

    await fs.unlink(pathTmpOgg).catch((error) => console.error(error));

    return pathTmpMp4;
};

module.exports = { handleVoiceNoteDownload };
