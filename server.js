const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Ensure required directories exist
const UPLOADS_DIR = path.join(__dirname, "uploads");
const OUTPUTS_DIR = path.join(__dirname, "outputs");
const FONTS_DIR = path.join(__dirname, "Library/Fonts");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR);
if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR);


// Logging helper
function logMessage(message) {
  console.log(`[LOG] ${message}`);
}

// API Endpoint to process video with captions
app.post("/process-video", upload.single("video"), async (req, res) => {
  const videoPath = req.file.path; // Uploaded video file
  const captions = JSON.parse(req.body.captions); // Captions data
  const fontFamily = "Lilita One"; // Correct internal font family name
  const activeColor = req.body.activeColor || "&H00FF00"; // Default to green

  try {
    // Log the received parameters
    logMessage(`Video uploaded: ${videoPath}`);
    logMessage(`Font family requested: ${fontFamily}`);
    logMessage(`Active word color: ${activeColor}`);

    // Define the font path
    const fontPath = path.join(FONTS_DIR, `LilitaOne-Regular.ttf`);

    // Check if the font file exists
    if (!fs.existsSync(fontPath)) {
      logMessage(`Font file does not exist: ${fontPath}`);
      throw new Error(`Font file not found: ${fontFamily}`);
    }
    logMessage(`Font file exists: ${fontPath}`);

    // Generate ASS subtitles
    const assContent = captionsToAss(captions, fontFamily, activeColor);
    const assPath = path.join(UPLOADS_DIR, "captions.ass");
    fs.writeFileSync(assPath, assContent);
    logMessage(`Generated ASS file: ${assPath}`);

    // Burn subtitles into the video using FFmpeg
    const outputFilePath = path.join(OUTPUTS_DIR, `${Date.now()}-output.mp4`);
    logMessage(`Output file path: ${outputFilePath}`);

    ffmpeg(videoPath)
      .outputOptions([
        `-vf ass=${assPath}`,
        "-nostdin",
      ])
      .on("start", (cmd) => logMessage(`FFmpeg Command: ${cmd}`))
      .on("stderr", (stderrLine) => logMessage(`FFmpeg STDERR: ${stderrLine}`))
      .on("error", (err) => {
        logMessage(`Error during FFmpeg processing: ${err.message}`);
        res.status(500).send("Error processing video");
      })
      .on("end", () => {
        logMessage(`Video processed successfully. Output file: ${outputFilePath}`);
        res.json({ url: `${req.protocol}://${req.get('host')}/outputs/${path.basename(outputFilePath)}` });
      })
      .save(outputFilePath);
  } catch (err) {
    logMessage(`Error: ${err.message}`);
    res.status(500).send(err.message);
  }
});

// Function to generate ASS subtitles
function captionsToAss(captions, fontFamily, activeColor) {
  const assHeader = `
[Script Info]
Title: Active Word Highlighting
ScriptType: v4.00+
Collisions: Normal
PlayDepth: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},36,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1
Style: Highlight,${fontFamily},36,${activeColor},&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const assEvents = captions
    .map((caption) => {
      const words = caption.text.split(" ");
      const captionDuration = caption.endTime - caption.startTime;
      const wordDuration = captionDuration / words.length;

      return words
        .map((word, index) => {
          const wordStartTime = caption.startTime + index * wordDuration;
          const wordEndTime = wordStartTime + wordDuration;

          const beforeWord = words.slice(0, index).join(" ");
          const activeWord = word;
          const afterWord = words.slice(index + 1).join(" ");

          const fullCaption = [
            beforeWord ? `${beforeWord} ` : "",
            `{\\1c${activeColor}\\b1}${activeWord}{\\b0\\1c&HFFFFFF&}`,
            afterWord ? ` ${afterWord}` : "",
          ].join("");

          return `Dialogue: 0,${formatTime(wordStartTime)},${formatTime(
            wordEndTime
          )},Default,,0,0,0,,${fullCaption}`;
        })
        .join("\n");
    })
    .join("\n");

  return assHeader + assEvents;
}

// Format time for ASS subtitles
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  const ms = Math.floor((seconds % 1) * 100).toString().padStart(2, "0");
  return `${h}:${m}:${s}.${ms}`;
}

// Serve the outputs directory
app.use("/outputs", express.static(OUTPUTS_DIR));

// Start the server
app.listen(PORT, () => {
  logMessage(`Server running on http://localhost:${PORT}`);
});