const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3015;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configure multer for file uploads with date-based organization
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create date-based folder (YYYY-MM-DD)
    const today = new Date();
    const dateFolder = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    const uploadPath = path.join(__dirname, 'images', dateFolder);
    
    // Create directory if it doesn't exist
    fs.mkdirSync(uploadPath, { recursive: true });
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Use timestamp + original filename to avoid conflicts
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${sanitizedName}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle single file upload
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileInfo = {
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      relativePath: path.relative(__dirname, req.file.path),
      uploadDate: new Date().toISOString()
    };

    console.log(`📁 Image saved: ${fileInfo.relativePath}`);
    res.json(fileInfo);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Handle multiple file uploads
app.post('/upload-multiple', upload.array('images', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const filesInfo = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      relativePath: path.relative(__dirname, file.path),
      uploadDate: new Date().toISOString()
    }));

    console.log(`📁 ${filesInfo.length} images saved to date-organized folders`);
    res.json({ success: true, files: filesInfo });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Get list of uploaded images organized by date
app.get('/api/images', (req, res) => {
  try {
    const imagesDir = path.join(__dirname, 'images');
    
    if (!fs.existsSync(imagesDir)) {
      return res.json({ dates: [], totalImages: 0 });
    }

    const dateDirectories = fs.readdirSync(imagesDir)
      .filter(item => fs.statSync(path.join(imagesDir, item)).isDirectory())
      .sort()
      .reverse(); // Most recent first

    const imagesByDate = {};
    let totalImages = 0;

    dateDirectories.forEach(dateDir => {
      const datePath = path.join(imagesDir, dateDir);
      const files = fs.readdirSync(datePath)
        .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
        .map(file => ({
          filename: file,
          path: `/images/${dateDir}/${file}`,
          size: fs.statSync(path.join(datePath, file)).size,
          modified: fs.statSync(path.join(datePath, file)).mtime
        }));
      
      if (files.length > 0) {
        imagesByDate[dateDir] = files;
        totalImages += files.length;
      }
    });

    res.json({
      success: true,
      dates: Object.keys(imagesByDate),
      imagesByDate: imagesByDate,
      totalImages: totalImages
    });
  } catch (error) {
    console.error('Error listing images:', error);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

// Serve uploaded images statically
app.use('/images', express.static(path.join(__dirname, 'images')));

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 50MB)' });
    }
  }
  res.status(500).json({ error: error.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Image Gallery server running on port ${PORT}`);
  console.log(`📁 Images will be organized in: ./images/YYYY-MM-DD/`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
  
  // Create images directory if it doesn't exist
  const imagesDir = path.join(__dirname, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
    console.log(`📁 Created images directory: ${imagesDir}`);
  }
});