const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Set FFprobe path - try @ffprobe-installer first, fall back to ffprobe next to ffmpeg
try {
  const ffprobePath = require('@ffprobe-installer/ffprobe').path;
  ffmpeg.setFfprobePath(ffprobePath);
} catch {
  // ffprobe-installer not available - check if ffprobe exists next to ffmpeg
  const ffprobeNext = path.join(path.dirname(ffmpegPath), 'ffprobe.exe');
  if (fs.existsSync(ffprobeNext)) {
    ffmpeg.setFfprobePath(ffprobeNext);
  }
  // Otherwise fluent-ffmpeg will try to find it on PATH
}

/**
 * Get video duration in seconds
 * Tries ffprobe first, falls back to ffmpeg-based detection
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (!err && metadata?.format?.duration) {
        return resolve(metadata.format.duration);
      }
      // Fallback: use ffmpeg to get duration by reading the file
      console.log('⚠️  ffprobe failed, trying ffmpeg fallback for duration...');
      try {
        const result = execSync(
          `"${ffmpegPath}" -i "${videoPath}" 2>&1`,
          { encoding: 'utf8', timeout: 30000 }
        ).toString();
        const match = result.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
        if (match) {
          const hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const seconds = parseInt(match[3]);
          const fraction = parseInt(match[4]) / 100;
          resolve(hours * 3600 + minutes * 60 + seconds + fraction);
        } else {
          reject(err || new Error('Could not determine video duration'));
        }
      } catch (ffmpegErr) {
        // ffmpeg exits with code 1 when no output specified, but stderr has the info
        const output = ffmpegErr.stderr || ffmpegErr.stdout || '';
        const match = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
        if (match) {
          const hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const seconds = parseInt(match[3]);
          const fraction = parseInt(match[4]) / 100;
          resolve(hours * 3600 + minutes * 60 + seconds + fraction);
        } else {
          reject(err || new Error('Could not determine video duration'));
        }
      }
    });
  });
}

/**
 * Get video dimensions (width and height)
 */
function getVideoDimensions(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        return reject(new Error('No video stream found'));
      }
      resolve({
        width: videoStream.width,
        height: videoStream.height,
      });
    });
  });
}

/**
 * Get all filler videos from database and download from IPFS
 */
async function getAllFillerVideos() {
  const { getFillerVideos } = require('../controllers/admin-controller');
  const axios = require('axios');
  const { PINATA_GATEWAY_URL } = require('../storage/pinata');

  try {
    // Get filler videos from database
    const fillerVideos = await getFillerVideos();

    if (!fillerVideos || fillerVideos.length === 0) {
      throw new Error('No filler videos found. Admin needs to upload filler videos.');
    }

    // Download all filler videos from IPFS to temp directory
    const tempDir = path.join(process.cwd(), 'temp');
    fs.ensureDirSync(tempDir);

    const downloadedPaths = [];

    for (const video of fillerVideos) {
      try {
        if (!video.ipfs_url) {
          console.warn(`⚠️  Filler video ${video.id} has no IPFS URL, skipping`);
          continue;
        }

        const outputPath = path.join(tempDir, `filler_${Date.now()}_${video.id}_${video.filename}`);
        
        // Download from IPFS gateway URL
        console.log(`⬇️  Downloading filler video from IPFS: ${video.ipfs_url}`);
        const response = await axios({
          method: 'GET',
          url: video.ipfs_url,
          responseType: 'stream',
          timeout: 300000, // 5 minute timeout for large files
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        downloadedPaths.push(outputPath);
        console.log(`✅ Downloaded filler video: ${video.filename}`);
      } catch (error) {
        console.error(`❌ Failed to download filler video ${video.filename}:`, error.message);
      }
    }

    if (downloadedPaths.length === 0) {
      throw new Error('Failed to download any filler videos from IPFS');
    }

    console.log(`✅ Downloaded ${downloadedPaths.length} filler video(s) from IPFS`);
    return downloadedPaths;
  } catch (error) {
    throw new Error(`Error reading filler videos: ${error.message}`);
  }
}

/**
 * Shuffle array randomly
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Get random split position from configured SPLIT_POSITIONS
 */
function getRandomPosition() {
  const { VIDEO_CONFIG } = require('../config/constants');
  const positions = VIDEO_CONFIG.SPLIT_POSITIONS || ['top', 'bottom'];
  return positions[Math.floor(Math.random() * positions.length)];
}

/**
 * Chain random filler videos to match main video duration
 */
async function createFillerChain(fillerVideos, targetDuration, outputPath) {
  console.log('⏳ Creating filler video chain...');

  // Get filler videos if they're not already downloaded
  let videoList = fillerVideos;
  if (!Array.isArray(fillerVideos) || fillerVideos.length === 0) {
    videoList = await getAllFillerVideos();
  }

  // Shuffle filler videos for randomness
  const shuffledFillers = shuffleArray(videoList);

  // Get durations of all filler videos
  const fillerDurations = await Promise.all(
    shuffledFillers.map(video => getVideoDuration(video))
  );

  // Build chain until we exceed target duration
  let totalDuration = 0;
  let chainedVideos = [];
  let index = 0;

  while (totalDuration < targetDuration) {
    const currentVideo = shuffledFillers[index % shuffledFillers.length];
    const currentDuration = fillerDurations[index % fillerDurations.length];

    chainedVideos.push(currentVideo);
    totalDuration += currentDuration;
    index++;
  }

  console.log(`📺 Chaining ${chainedVideos.length} filler videos...`);

  return new Promise((resolve, reject) => {
    try {
      // Create concat file list
      const concatList = chainedVideos
        .map(video => `file '${path.resolve(video).replace(/\\/g, '/')}'`)
        .join('\n');

      const tempDir = path.join(process.cwd(), 'temp');
      fs.ensureDirSync(tempDir);
      const concatFile = path.join(tempDir, `concat_${Date.now()}.txt`);
      fs.writeFileSync(concatFile, concatList);

      // Concatenate and trim to exact duration
      ffmpeg()
        .input(concatFile)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-t', targetDuration.toString(),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-an', // No audio from filler
        ])
        .output(outputPath)
        .on('end', () => {
          fs.unlinkSync(concatFile);
          console.log('✅ Filler chain created');
          resolve();
        })
        .on('error', (err) => {
          if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
          reject(err);
        })
        .run();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Create split-screen video
 * @param {string} mainVideoPath
 * @param {string} fillerVideoPath
 * @param {string} outputPath
 * @param {string} position - 'top' or 'bottom' (where filler goes)
 * @param {object} mainDimensions - {width, height}
 * @param {string|null} videoId - Video ID for WebSocket progress tracking
 */
async function createSplitScreen(mainVideoPath, fillerVideoPath, outputPath, position, mainDimensions, videoId = null) {
  const { VIDEO_CONFIG } = require('../config/constants');
  const { emitProgress } = require('../websocket/socket-server');

  const heightPercent = VIDEO_CONFIG.MAIN_VIDEO_HEIGHT_PERCENT / 100;
  console.log(`🎬 Creating split-screen video (${position} layout, main=${VIDEO_CONFIG.MAIN_VIDEO_HEIGHT_PERCENT}%)...`);

  return new Promise((resolve, reject) => {
    try {
      // Keep the original video dimensions - just add filler in the remaining space
      // Ensure all dimensions are even (H.264 requirement)
      const outputWidth = Math.floor(mainDimensions.width / 2) * 2;
      const totalHeight = Math.floor(mainDimensions.height / (heightPercent) / 2) * 2;
      const mainHeight = Math.floor(totalHeight * heightPercent / 2) * 2;
      const fillerHeight = totalHeight - mainHeight;

      console.log(`📐 Output: ${outputWidth}x${totalHeight} (main=${mainHeight}px, filler=${fillerHeight}px)`);

      // Calculate filter complex based on position
      let filterComplex;

      if (position === 'top') {
        // Filler on top, main on bottom
        filterComplex = [
          `[1:v]scale=${outputWidth}:${fillerHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${fillerHeight}:(ow-iw)/2:(oh-ih)/2:color=black[filler]`,
          `[0:v]scale=${outputWidth}:${mainHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${mainHeight}:(ow-iw)/2:(oh-ih)/2:color=black[main]`,
          `[filler][main]vstack=inputs=2[outv]`,
        ].join(';');
      } else {
        // Main on top, filler on bottom
        filterComplex = [
          `[0:v]scale=${outputWidth}:${mainHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${mainHeight}:(ow-iw)/2:(oh-ih)/2:color=black[main]`,
          `[1:v]scale=${outputWidth}:${fillerHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${fillerHeight}:(ow-iw)/2:(oh-ih)/2:color=black[filler]`,
          `[main][filler]vstack=inputs=2[outv]`,
        ].join(';');
      }

      ffmpeg()
        .input(mainVideoPath)
        .input(fillerVideoPath)
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[outv]',
          '-map', '0:a?', // Keep audio from main video only
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
        ])
        .output(outputPath)
        .on('progress', (progress) => {
          if (progress.percent) {
            const pct = Math.round(progress.percent);
            process.stdout.write(`\r⏳ Processing: ${pct}%`);
            // Map FFmpeg 0-100% to overall 30-90% range
            if (videoId) {
              const overallProgress = 30 + (pct * 0.6);
              emitProgress(videoId, 'processing', overallProgress, `Creating split-screen... ${pct}%`);
            }
          }
        })
        .on('end', () => {
          console.log('\n✅ Split-screen video created!');
          resolve();
        })
        .on('stderr', (stderrLine) => {
          // Log FFmpeg stderr for debugging (only errors/warnings)
          if (stderrLine.includes('Error') || stderrLine.includes('error') || stderrLine.includes('Invalid')) {
            console.error('FFmpeg stderr:', stderrLine);
          }
        })
        .on('error', (err, stdout, stderr) => {
          console.error('\n❌ FFmpeg Error:', err.message);
          if (stderr) {
            // Log last few lines of stderr for debugging
            const lines = stderr.split('\n').filter(l => l.trim()).slice(-10);
            console.error('FFmpeg stderr (last 10 lines):\n' + lines.join('\n'));
          }
          reject(err);
        })
        .run();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  getVideoDuration,
  getVideoDimensions,
  getAllFillerVideos,
  shuffleArray,
  getRandomPosition,
  createFillerChain,
  createSplitScreen,
};
