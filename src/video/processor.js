const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const {
  getVideoDuration,
  getVideoDimensions,
  getAllFillerVideos,
  getRandomPosition,
  createFillerChain,
  createSplitScreen,
} = require('./utils');
const { emitProgress } = require('../websocket/socket-server');

/**
 * Process a video with split-screen effect
 * @param {string} mainVideoPath - Path to main video file
 * @param {string} outputDir - Directory to save processed video
 * @param {string} videoId - Video ID for progress tracking
 * @returns {Promise<string>} - Path to processed video
 */
async function processVideo(mainVideoPath, outputDir = null, videoId = null) {
  const tempDir = path.join(process.cwd(), 'temp');
  fs.ensureDirSync(tempDir);

  if (!outputDir) {
    outputDir = tempDir;
  }
  fs.ensureDirSync(outputDir);

  const uid = uuidv4();
  const timestamp = Date.now();
  const outputPath = path.join(outputDir, `edited_${uid}_${timestamp}.mp4`);
  const tempFillerPath = path.join(tempDir, `filler_${uid}_${timestamp}.mp4`);

  try {
    console.log('\n' + '='.repeat(50));
    console.log(`🎥 Processing Video`);
    console.log('='.repeat(50));

    // Validate input file exists
    if (!fs.existsSync(mainVideoPath)) {
      throw new Error(`Input file not found: ${mainVideoPath}`);
    }

    // Get main video info
    console.log('📊 Analyzing main video...');
    if (videoId) emitProgress(videoId, 'analyzing', 8, 'Analyzing video dimensions...');

    const mainDuration = await getVideoDuration(mainVideoPath);
    const mainDimensions = await getVideoDimensions(mainVideoPath);
    console.log(`⏱️  Duration: ${mainDuration.toFixed(2)}s`);
    console.log(`📐 Dimensions: ${mainDimensions.width}x${mainDimensions.height}`);

    // Get all filler videos from database/IPFS
    if (videoId) emitProgress(videoId, 'downloading_filler', 15, 'Downloading filler videos...');
    const fillerVideos = await getAllFillerVideos();
    console.log(`🎬 Found ${fillerVideos.length} filler video(s)`);

    // Choose random position
    const position = getRandomPosition();
    console.log(`🎨 Split position: ${position}`);

    // Create filler chain
    if (videoId) emitProgress(videoId, 'creating_chain', 25, 'Creating filler sequence...');
    await createFillerChain(fillerVideos, mainDuration, tempFillerPath);

    // Create split-screen
    if (videoId) emitProgress(videoId, 'processing', 30, 'Creating split-screen video...');
    await createSplitScreen(mainVideoPath, tempFillerPath, outputPath, position, mainDimensions, videoId);

    // Cleanup temp filler file
    if (fs.existsSync(tempFillerPath)) {
      fs.unlinkSync(tempFillerPath);
    }

    console.log(`\n✅ SUCCESS!`);
    console.log(`📁 Output: ${outputPath}`);
    console.log('='.repeat(50) + '\n');

    return outputPath;
  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}\n`);

    // Cleanup temp files
    if (fs.existsSync(tempFillerPath)) {
      fs.unlinkSync(tempFillerPath);
    }
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    throw error;
  }
}

/**
 * Generate auto title for video
 */
function generateVideoTitle() {
  const timestamp = new Date().toLocaleTimeString();
  return `Split-Screen Short #${Date.now()}`;
}

/**
 * Generate auto caption for video
 */
function generateVideoCaption() {
  const captions = [
    'Amazing split-screen gameplay! #Shorts #Gaming #Viral',
    'You won\'t believe this split-screen edit! #Shorts #Trending',
    'Insane gameplay combined! #Shorts #Gaming',
    'Double the action, double the fun! #Shorts #Viral',
    'Check out this sick split-screen edit #Shorts #Amazing',
  ];
  return captions[Math.floor(Math.random() * captions.length)];
}

module.exports = {
  processVideo,
  generateVideoTitle,
  generateVideoCaption,
};
