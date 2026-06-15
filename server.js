const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const archiver = require('archiver');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const MAX_UPLOAD_FILES = parseInt(process.env.MAX_UPLOAD_FILES) || 20;
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 500;
const AUTO_DELETE_MINUTES = parseInt(process.env.AUTO_DELETE_MINUTES) || 60;
const CLEANUP_INTERVAL_MINUTES = parseInt(process.env.CLEANUP_INTERVAL_MINUTES) || 5;
const QUEUE_CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY) || 1;

// In-memory job storage
const jobs = new Map();
const fileProgress = new Map(); // Track progress for each file

// Queue system
class VideoQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { task, resolve, reject } = this.queue.shift();

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

const videoQueue = new VideoQueue(QUEUE_CONCURRENCY);

// Multer configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const jobId = req.jobId;
    const uploadPath = path.join(__dirname, 'uploads', jobId);
    await fs.mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Sanitize filename to prevent issues
    const sanitized = file.originalname
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Remove invalid chars
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_+/g, '_'); // Remove duplicate underscores
    cb(null, sanitized);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|mov|mkv|avi|webm|flv|wmv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('video/');
    
    if (extname || mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Format video tidak didukung'));
    }
  }
});

// Utility functions
function generateJobId() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = Math.random().toString(36).substring(2, 8);
  return `job_${timestamp}_${random}`;
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateRandomMetadata() {
  const authors = [
    'Nova_Media', 'Frame_Studio', 'Motion_Lab', 'Digital_Wave',
    'Creative_Edge', 'Visual_Arts', 'Media_Pro', 'Content_Master',
    'Pixel_Factory', 'Stream_Creator', 'Video_Forge', 'Edit_Zone'
  ];

  const titles = [
    'Amazing_Video', 'Creative_Clip', 'Fresh_Media', 'Stunning_Content',
    'High_Quality', 'Professional', 'Enhanced_Result', 'Premium_Quality',
    'Outstanding_Media', 'Best_Video', 'Awesome_Output', 'Superb_Export'
  ];

  const descriptions = [
    'high_quality_export', 'optimized_for_sharing', 'enhanced_media',
    'professional_content', 'premium_result', 'carefully_processed'
  ];

  const keywords = [
    'clip', 'media', 'export', 'visual', 'content', 'video',
    'production', 'creative', 'premium', 'quality', 'enhanced'
  ];

  const title = getRandomElement(titles);
  const shuffledDesc = shuffleArray(descriptions).slice(0, 3).join(' ');

  const now = new Date();
  const shift = Math.floor(Math.random() * 20) - 10;
  const shiftedTime = new Date(now.getTime() + shift * 1000);
  const creationTime = shiftedTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const selectedKeywords = shuffleArray(keywords).slice(0, 5).join(' ');

  return {
    artist: getRandomElement(authors),
    author: getRandomElement(authors),
    title: title,
    description: shuffledDesc,
    comment: `randomized_${Math.random().toString(36).substring(2, 12)}`,
    encoder: `metavid_${Math.random().toString(36).substring(2, 8)}`,
    publisher: getRandomElement(authors),
    keywords: selectedKeywords,
    creation_time: creationTime,
    date: shiftedTime.toISOString().split('T')[0]
  };
}

async function processVideoWithProgress(jobId, fileInfo, inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const metadata = generateRandomMetadata();
    const progressKey = `${jobId}_${fileInfo.originalName}`;
    
    // Audio pitch: ±0.01 (very subtle)
    const pitchFactor = 1 + (Math.random() * 0.02 - 0.01);
    const tempoFactor = 1 / pitchFactor;
    
    const audioBitrates = ['128k', '160k', '192k'];
    const audioBitrate = getRandomElement(audioBitrates);
    
    const crfValues = [22, 23, 24];
    const crf = getRandomElement(crfValues);
    
    let command = ffmpeg(inputPath)
      .outputOptions(['-y'])
      .outputOptions(['-map_metadata', '-1'])
      .videoFilters(['noise=alls=1:allf=t+u', 'crop=iw-2:ih-2:1:1', 'scale=iw:ih'])
      .audioFilters([`asetrate=44100*${pitchFactor.toFixed(4)}`, 'aresample=44100', `atempo=${tempoFactor.toFixed(4)}`])
      .videoCodec('libx264')
      .outputOptions(['-crf', crf.toString()])
      .outputOptions(['-preset', 'veryfast'])
      .audioCodec('aac')
      .audioBitrate(audioBitrate)
      .outputOptions([
        '-metadata', `title=${metadata.title}`,
        '-metadata', `artist=${metadata.artist}`,
        '-metadata', `author=${metadata.author}`,
        '-metadata', `comment=${metadata.comment}`,
        '-metadata', `description=${metadata.description}`,
        '-metadata', `encoder=${metadata.encoder}`,
        '-metadata', `publisher=${metadata.publisher}`,
        '-metadata', `keywords=${metadata.keywords}`,
        '-metadata', `creation_time=${metadata.creation_time}`,
        '-metadata', `date=${metadata.date}`
      ])
      .output(outputPath);

    command
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          const percent = progress.percent.toFixed(1);
          console.log(`Processing ${fileInfo.originalName}: ${percent}%`);
          // Update in-memory progress
          fileProgress.set(progressKey, percent);
        }
      })
      .on('end', () => {
        console.log('Processing finished successfully');
        fileProgress.delete(progressKey);
        resolve();
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg error:', err.message);
        fileProgress.delete(progressKey);
        if (stderr) console.error('FFmpeg stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

async function processVideo(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const metadata = generateRandomMetadata();
    
    // Audio pitch: ±0.01 (very subtle)
    const pitchFactor = 1 + (Math.random() * 0.02 - 0.01); // 0.99 to 1.01
    const tempoFactor = 1 / pitchFactor;
    
    // Audio bitrate jitter
    const audioBitrates = ['128k', '160k', '192k'];
    const audioBitrate = getRandomElement(audioBitrates);
    
    // Video CRF jitter
    const crfValues = [22, 23, 24];
    const crf = getRandomElement(crfValues);
    
    let command = ffmpeg(inputPath)
      .outputOptions(['-y'])
      .outputOptions(['-map_metadata', '-1'])
      
      // Video filters: noise + pixel shift
      .videoFilters([
        'noise=alls=1:allf=t+u',
        'crop=iw-2:ih-2:1:1',
        'scale=iw:ih'
      ])
      
      // Audio filters: pitch shift
      .audioFilters([
        `asetrate=44100*${pitchFactor.toFixed(4)}`,
        'aresample=44100',
        `atempo=${tempoFactor.toFixed(4)}`
      ])
      
      // Video codec
      .videoCodec('libx264')
      .outputOptions(['-crf', crf.toString()])
      .outputOptions(['-preset', 'veryfast'])
      
      // Audio codec
      .audioCodec('aac')
      .audioBitrate(audioBitrate)
      
      // Add metadata using proper API
      .outputOptions([
        '-metadata', `title=${metadata.title}`,
        '-metadata', `artist=${metadata.artist}`,
        '-metadata', `author=${metadata.author}`,
        '-metadata', `comment=${metadata.comment}`,
        '-metadata', `description=${metadata.description}`,
        '-metadata', `encoder=${metadata.encoder}`,
        '-metadata', `publisher=${metadata.publisher}`,
        '-metadata', `keywords=${metadata.keywords}`,
        '-metadata', `creation_time=${metadata.creation_time}`,
        '-metadata', `date=${metadata.date}`
      ])
      .output(outputPath);

    command
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Processing: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log('Processing finished successfully');
        resolve();
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg error:', err.message);
        if (stderr) console.error('FFmpeg stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

async function processFileInQueue(jobId, fileInfo) {
  const job = jobs.get(jobId);
  if (!job) return;

  // Update file status
  fileInfo.status = 'processing';

  try {
    const inputPath = path.join(__dirname, 'uploads', jobId, fileInfo.uploadedName);
    const outputDir = path.join(__dirname, 'outputs', jobId);
    await fs.mkdir(outputDir, { recursive: true });
    
    const outputPath = path.join(outputDir, fileInfo.outputName);

    // Process video with FFmpeg
    await processVideoWithProgress(jobId, fileInfo, inputPath, outputPath);

    // Update file status
    fileInfo.status = 'done';
    fileInfo.downloadUrl = `/download/${jobId}/${fileInfo.outputName}`;
    
    job.done++;
    
  } catch (error) {
    console.error(`Error processing ${fileInfo.originalName}:`, error);
    fileInfo.status = 'failed';
    fileInfo.error = error.message;
    job.failed++;
  }

  // Check if all files are processed
  const allProcessed = job.files.every(f => f.status === 'done' || f.status === 'failed');
  
  if (allProcessed) {
    job.completedAt = new Date().toISOString();
    job.expiresAt = new Date(Date.now() + AUTO_DELETE_MINUTES * 60 * 1000).toISOString();
    
    if (job.done > 0 && job.failed === 0) {
      job.status = 'completed';
    } else if (job.done > 0 && job.failed > 0) {
      job.status = 'partial_success';
    } else {
      job.status = 'failed';
    }

    // Create ZIP if multiple files and at least one success
    if (job.files.length > 1 && job.done > 0) {
      try {
        await createZipFile(jobId);
        job.zipUrl = `/download/${jobId}/zip`;
      } catch (error) {
        console.error('Error creating ZIP:', error);
      }
    }
  }
}

async function createZipFile(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  const outputDir = path.join(__dirname, 'outputs', jobId);
  const zipPath = path.join(outputDir, `${jobId}.zip`);

  return new Promise((resolve, reject) => {
    const output = fsSync.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`ZIP created: ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add only successful files to ZIP
    job.files.forEach(file => {
      if (file.status === 'done') {
        const filePath = path.join(outputDir, file.outputName);
        if (fsSync.existsSync(filePath)) {
          archive.file(filePath, { name: file.outputName });
        }
      }
    });

    archive.finalize();
  });
}

async function cleanupExpiredJobs() {
  const now = new Date();
  
  for (const [jobId, job] of jobs.entries()) {
    if (job.expiresAt && new Date(job.expiresAt) <= now) {
      console.log(`Cleaning up expired job: ${jobId}`);
      
      try {
        // Delete upload folder
        const uploadPath = path.join(__dirname, 'uploads', jobId);
        await fs.rm(uploadPath, { recursive: true, force: true });
        
        // Delete output folder
        const outputPath = path.join(__dirname, 'outputs', jobId);
        await fs.rm(outputPath, { recursive: true, force: true });
        
        // Update job status
        job.status = 'expired';
        
        // Remove from memory after some time
        setTimeout(() => {
          jobs.delete(jobId);
        }, 60000); // Keep for 1 more minute for error messages
        
      } catch (error) {
        console.error(`Error cleaning up job ${jobId}:`, error);
      }
    }
  }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Generate jobId middleware
app.use('/upload', (req, res, next) => {
  req.jobId = generateJobId();
  next();
});

// Routes
app.post('/upload', upload.array('videos', MAX_UPLOAD_FILES), async (req, res) => {
  try {
    const jobId = req.jobId;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tidak ada video yang diupload.'
      });
    }

    // Create job
    const job = {
      jobId,
      status: 'processing',
      total: files.length,
      done: 0,
      failed: 0,
      createdAt: new Date().toISOString(),
      completedAt: null,
      expiresAt: null,
      ttlMinutes: AUTO_DELETE_MINUTES,
      files: files.map(file => {
        // Get original name without extension
        const originalNameWithoutExt = path.parse(file.originalname).name;
        // Get sanitized filename (what's actually saved)
        const sanitizedName = file.filename;
        const sanitizedNameWithoutExt = path.parse(sanitizedName).name;
        
        return {
          originalName: file.originalname,
          uploadedName: sanitizedName,
          outputName: `${sanitizedNameWithoutExt}_new.mp4`,
          displayName: `${originalNameWithoutExt}_new.mp4`, // For display in UI
          status: 'waiting',
          downloadUrl: null
        };
      })
    };

    jobs.set(jobId, job);

    // Add files to queue
    job.files.forEach(fileInfo => {
      videoQueue.add(() => processFileInQueue(jobId, fileInfo));
    });

    res.json({
      success: true,
      jobId,
      total: files.length,
      message: 'Video berhasil masuk queue.'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Terjadi kesalahan saat upload.'
    });
  }
});

app.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job tidak ditemukan.'
    });
  }

  if (job.status === 'expired') {
    return res.json({
      success: false,
      error: 'File sudah expired dan otomatis dihapus.'
    });
  }

  res.json({
    success: true,
    ...job
  });
});

app.get('/progress/:jobId/:fileName', (req, res) => {
  const { jobId, fileName } = req.params;
  const progressKey = `${jobId}_${fileName}`;
  const progress = fileProgress.get(progressKey);
  
  res.json({
    success: true,
    progress: progress || 0
  });
});

app.get('/history', (req, res) => {
  const history = Array.from(jobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50) // Max 50 recent jobs
    .map(job => ({
      jobId: job.jobId,
      status: job.status,
      total: job.total,
      done: job.done,
      failed: job.failed,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      hasZip: !!job.zipUrl,
      ttlMinutes: job.ttlMinutes,
      files: job.files.map(f => ({
        originalName: f.originalName,
        outputName: f.outputName,
        status: f.status,
        downloadUrl: f.downloadUrl
      }))
    }));

  res.json({
    success: true,
    history
  });
});

app.get('/download/:jobId/:fileName', async (req, res) => {
  const { jobId, fileName } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).send('Job tidak ditemukan.');
  }

  if (job.status === 'expired') {
    return res.status(410).send('File sudah expired dan otomatis dihapus.');
  }

  const filePath = path.join(__dirname, 'outputs', jobId, fileName);

  try {
    await fs.access(filePath);
    res.download(filePath);
  } catch (error) {
    res.status(404).send('File tidak ditemukan.');
  }
});

app.get('/download/:jobId/zip', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).send('Job tidak ditemukan.');
  }

  if (job.status === 'expired') {
    return res.status(410).send('File sudah expired dan otomatis dihapus.');
  }

  const zipPath = path.join(__dirname, 'outputs', jobId, `${jobId}.zip`);

  try {
    await fs.access(zipPath);
    res.download(zipPath, `metavid_${jobId}.zip`);
  } catch (error) {
    res.status(404).send('ZIP file tidak ditemukan.');
  }
});

// Cleanup scheduler
setInterval(() => {
  cleanupExpiredJobs();
}, CLEANUP_INTERVAL_MINUTES * 60 * 1000);

// Start server
app.listen(PORT, () => {
  console.log(`MetaVid Randomizer running on port ${PORT}`);
  console.log(`Max upload files: ${MAX_UPLOAD_FILES}`);
  console.log(`Max file size: ${MAX_FILE_SIZE_MB}MB`);
  console.log(`Auto delete: ${AUTO_DELETE_MINUTES} minutes`);
  console.log(`Queue concurrency: ${QUEUE_CONCURRENCY}`);
});
