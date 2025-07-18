// Import the new imageProcessor module
import { processFile, handleFileSelect, handleFileDrop } from './imageProcessor.js';

// Initialize Dexie database
const db = new Dexie('AIImageGallery');
db.version(1).stores({
    images: '++id, title, prompt, model, tags, notes, dateAdded, imageData, metadata'
});

let currentImageId = null;
let currentImageData = null;
let allImages = [];

// Initialize the app
async function init() {
    await loadImages();
    updateStats();
    setupEventListeners();
}

// Setup event listeners
function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const searchBox = document.getElementById('searchBox');
    const modal = document.getElementById('imageModal');
    const closeModal = document.getElementById('closeModal');
    const saveMetadata = document.getElementById('saveMetadata');
    const deleteImage = document.getElementById('deleteImage');
    const exportData = document.getElementById('exportData');
    const importData = document.getElementById('importData');
    const importFile = document.getElementById('importFile');
    const downloadWorkflow = document.getElementById('downloadWorkflow');

    // Upload area click
    uploadArea.addEventListener('click', () => fileInput.click());

    // File input change - NOW USES THE MODULE
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target, db, () => {
            loadImages();
            updateStats();
        });
    });

    // Drag and drop - NOW USES THE MODULE
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        uploadArea.classList.remove('dragover');
        handleFileDrop(e, db, () => {
            loadImages();
            updateStats();
        });
    });

    // Search functionality
    searchBox.addEventListener('input', handleSearch);

    // Modal events
    closeModal.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // Save and delete buttons
    saveMetadata.addEventListener('click', saveImageMetadata);
    deleteImage.addEventListener('click', deleteCurrentImage);
    
    // Export/Import buttons
    exportData.addEventListener('click', exportAllData);
    importData.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', importAllData);
    
    // Download workflow button
    downloadWorkflow.addEventListener('click', downloadCurrentWorkflow);
}

// Load all images from database
async function loadImages() {
    allImages = await db.images.orderBy('dateAdded').reverse().toArray();
    displayImages(allImages);
}

// Display images in gallery
function displayImages(images) {
    const gallery = document.getElementById('gallery');
    const noImages = document.getElementById('noImages');
    
    gallery.innerHTML = '';
    
    if (images.length === 0) {
        noImages.style.display = 'block';
        return;
    }
    
    noImages.style.display = 'none';
    
    images.forEach(image => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.onclick = () => openImageModal(image);
        
        const date = new Date(image.dateAdded).toLocaleDateString();
        
        // Get file size from base64 data
        const base64Data = image.imageData.split(',')[1];
        const fileSizeBytes = Math.round((base64Data.length * 3) / 4);
        const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);
        const fileSizeKB = (fileSizeBytes / 1024).toFixed(1);
        const displayFileSize = fileSizeBytes > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;
        
        // Create the card with the new layout
        card.innerHTML = `
            <img src="${image.imageData}" alt="${image.title || 'Untitled'}" loading="lazy">
            <div class="image-info">
                <div class="image-title">${image.title || 'Untitled'}</div>
                <div class="image-details">
                    <div class="image-detail-line">
                        📅 ${date}
                    </div>
                    <div class="image-detail-line">
                        📐 <span class="dimensions-placeholder">Loading...</span>
                    </div>
                    <div class="image-detail-line">
                        💾 ${displayFileSize}
                    </div>
                </div>
            </div>
        `;
        
        gallery.appendChild(card);
        
        // Calculate image dimensions asynchronously
        const img = new Image();
        img.onload = function() {
            const dimensions = `${this.naturalWidth} × ${this.naturalHeight}`;
            const dimensionsSpan = card.querySelector('.dimensions-placeholder');
            if (dimensionsSpan) {
                dimensionsSpan.textContent = dimensions;
            }
        };
        img.src = image.imageData;
    });
}

// Open image modal
function openImageModal(image) {
    currentImageId = image.id;
    currentImageData = image;
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const downloadWorkflow = document.getElementById('downloadWorkflow');
    
    modalImage.src = image.imageData;
    document.getElementById('imageTitle').value = image.title || '';
    document.getElementById('imagePrompt').value = image.prompt || '';
    document.getElementById('imageModel').value = image.model || '';
    document.getElementById('imageTags').value = image.tags || '';
    document.getElementById('imageNotes').value = image.notes || '';
    
    // Check if this image has ComfyUI workflow data
    const hasWorkflow = image.metadata && (image.metadata.workflow || image.metadata.prompt);
    if (hasWorkflow) {
        downloadWorkflow.style.display = 'inline-block';
    } else {
        downloadWorkflow.style.display = 'none';
    }
    
    // Display organized metadata
    displayOrganizedMetadata(image.metadata);
    
    modal.style.display = 'block';
}

// Display metadata in organized sections
function displayOrganizedMetadata(metadata) {
    const promptSection = document.getElementById('promptSection');
    const workflowSection = document.getElementById('workflowSection');
    const otherMetadataSection = document.getElementById('otherMetadataSection');
    const noMetadataMessage = document.getElementById('noMetadataMessage');
    
    const promptDisplay = document.getElementById('promptDisplay');
    const workflowDisplay = document.getElementById('workflowDisplay');
    const otherMetadataDisplay = document.getElementById('otherMetadataDisplay');
    
    // Reset all sections
    promptSection.style.display = 'none';
    workflowSection.style.display = 'none';
    otherMetadataSection.style.display = 'none';
    noMetadataMessage.style.display = 'block';
    
    if (!metadata || Object.keys(metadata).length === 0) {
        return;
    }
    
    let hasAnyMetadata = false;
    
    // Handle Prompt Data - Updated to be collapsible like Workflow Data
    if (metadata.prompt) {
        hasAnyMetadata = true;
        promptSection.style.display = 'block';
        try {
            const promptData = JSON.parse(metadata.prompt);
            if (typeof promptData === 'object') {
                // Check if this is ChatGPT data
                const isChatGPTData = promptData.tool && promptData.tool.includes('ChatGPT');
                
                if (isChatGPTData) {
                    // Show ChatGPT-specific summary
                    promptDisplay.innerHTML = `
                        <div style="color: #2c3e50; margin-bottom: 8px;">
                            <strong>Tool:</strong> ${promptData.tool || 'Unknown'}<br>
                            <strong>Style:</strong> ${promptData.style || 'Unknown'}<br>
                            <strong>Resolution:</strong> ${promptData.resolution || 'Unknown'}<br>
                            <strong>Generated:</strong> ${promptData.date_generated || 'Unknown'}
                        </div>
                        <details style="margin-top: 8px;">
                            <summary style="cursor: pointer; color: #2c3e50; font-weight: bold;">View Full ChatGPT JSON</summary>
                            <pre style="margin: 8px 0 0 0; white-space: pre-wrap; font-size: 10px; max-height: 200px; overflow-y: auto; background: #fff; padding: 8px; border-radius: 4px;">${JSON.stringify(promptData, null, 2)}</pre>
                        </details>
                    `;
                } else {
                    // Show regular prompt data summary
                    const promptKeys = Object.keys(promptData);
                    const promptSize = JSON.stringify(promptData).length;
                    
                    promptDisplay.innerHTML = `
                        <div style="color: #2c3e50; margin-bottom: 8px;">
                            <strong>Keys:</strong> ${promptKeys.join(', ')}<br>
                            <strong>Data Size:</strong> ${promptSize} characters
                        </div>
                        <details style="margin-top: 8px;">
                            <summary style="cursor: pointer; color: #2c3e50; font-weight: bold;">View Full Prompt JSON</summary>
                            <pre style="margin: 8px 0 0 0; white-space: pre-wrap; font-size: 10px; max-height: 200px; overflow-y: auto; background: #fff; padding: 8px; border-radius: 4px;">${JSON.stringify(promptData, null, 2)}</pre>
                        </details>
                    `;
                }
            } else {
                // If it's not an object (plain text), still make it collapsible
                promptDisplay.innerHTML = `
                    <div style="color: #2c3e50; margin-bottom: 8px;">
                        <strong>Type:</strong> Plain Text<br>
                        <strong>Length:</strong> ${promptData.length} characters
                    </div>
                    <details style="margin-top: 8px;">
                        <summary style="cursor: pointer; color: #2c3e50; font-weight: bold;">View Full Prompt Data</summary>
                        <pre style="margin: 8px 0 0 0; white-space: pre-wrap; font-size: 11px; max-height: 200px; overflow-y: auto; background: #fff; padding: 8px; border-radius: 4px; color: #2c3e50;">${promptData}</pre>
                    </details>
                `;
            }
        } catch (e) {
            // If not JSON, display as text with collapsible view
            const textLength = metadata.prompt.length;
            promptDisplay.innerHTML = `
                <div style="color: #2c3e50; margin-bottom: 8px;">
                    <strong>Type:</strong> Raw Text<br>
                    <strong>Length:</strong> ${textLength} characters
                </div>
                <details style="margin-top: 8px;">
                    <summary style="cursor: pointer; color: #2c3e50; font-weight: bold;">View Full Prompt Data</summary>
                    <pre style="margin: 8px 0 0 0; white-space: pre-wrap; font-size: 11px; max-height: 200px; overflow-y: auto; background: #fff; padding: 8px; border-radius: 4px; color: #2c3e50;">${metadata.prompt}</pre>
                </details>
            `;
        }
    }
    
    // Handle Workflow Data
    if (metadata.workflow) {
        hasAnyMetadata = true;
        workflowSection.style.display = 'block';
        try {
            const workflowData = JSON.parse(metadata.workflow);
            
            // Extract text from workflow data and populate AI Prompt field
            extractTextFromWorkflow(workflowData);
            
            // Extract model information and populate AI Model field
            extractModelFromWorkflow(workflowData);
            
            // Show a summary of the workflow
            const nodeCount = workflowData.nodes ? workflowData.nodes.length : 'Unknown';
            const workflowId = workflowData.id || 'Unknown';
            const lastNodeId = workflowData.last_node_id || 'Unknown';
            
            workflowDisplay.innerHTML = `
                <div style="color: #856404; margin-bottom: 8px;">
                    <strong>Workflow ID:</strong> ${workflowId}<br>
                    <strong>Nodes:</strong> ${nodeCount}<br>
                    <strong>Last Node ID:</strong> ${lastNodeId}
                </div>
                <details style="margin-top: 8px;">
                    <summary style="cursor: pointer; color: #856404; font-weight: bold;">View Full Workflow JSON</summary>
                    <pre style="margin: 8px 0 0 0; white-space: pre-wrap; font-size: 10px; max-height: 200px; overflow-y: auto; background: #fff; padding: 8px; border-radius: 4px;">${JSON.stringify(workflowData, null, 2)}</pre>
                </details>
            `;
        } catch (e) {
            workflowDisplay.innerHTML = `<div style="color: #856404;">Raw workflow data (${metadata.workflow.length} characters)</div>`;
        }
    }
    
    // Handle Other Metadata
    const otherMetadata = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (key !== 'prompt' && key !== 'workflow' && value !== null && value !== undefined && value !== '') {
            otherMetadata[key] = value;
        }
    }
    
    if (Object.keys(otherMetadata).length > 0) {
        hasAnyMetadata = true;
        otherMetadataSection.style.display = 'block';
        let otherHtml = '';
        for (const [key, value] of Object.entries(otherMetadata)) {
            otherHtml += `<strong>${key}:</strong> ${value}<br>`;
        }
        otherMetadataDisplay.innerHTML = otherHtml;
    }
    
    // Hide "no metadata" message if we have any metadata
    if (hasAnyMetadata) {
        noMetadataMessage.style.display = 'none';
    }
}

// Extract model information from workflow and populate AI Model field
function extractModelFromWorkflow(workflowData) {
    const modelInput = document.getElementById('imageModel');
    
    // Only populate if the field is currently empty
    if (modelInput.value && modelInput.value.trim() !== '') {
        return; // Don't overwrite user's manual input
    }
    
    let modelNames = [];
    
    // Search through workflow nodes for model information
    if (workflowData.nodes && Array.isArray(workflowData.nodes)) {
        for (const node of workflowData.nodes) {
            
            // Look for CheckpointLoaderSimple nodes (most common)
            if (node.type === 'CheckpointLoaderSimple') {
                if (node.widgets_values && Array.isArray(node.widgets_values) && node.widgets_values.length > 0) {
                    const checkpointName = node.widgets_values[0];
                    if (typeof checkpointName === 'string' && checkpointName.length > 0) {
                        modelNames.push({
                            name: checkpointName,
                            type: 'Checkpoint',
                            priority: 1
                        });
                    }
                }
            }
            
            // Look for LoraLoader nodes
            if (node.type === 'LoraLoader') {
                if (node.widgets_values && Array.isArray(node.widgets_values) && node.widgets_values.length > 0) {
                    const loraName = node.widgets_values[0];
                    if (typeof loraName === 'string' && loraName.length > 0) {
                        modelNames.push({
                            name: loraName,
                            type: 'LoRA',
                            priority: 2
                        });
                    }
                }
            }
            
            // Look for other model loader nodes
            if (node.type && (node.type.includes('Loader') || node.type.includes('Model')) && 
                node.type !== 'ControlNetLoader' && node.type !== 'VAELoader') {
                if (node.widgets_values && Array.isArray(node.widgets_values)) {
                    for (const value of node.widgets_values) {
                        if (typeof value === 'string' && value.length > 0 && 
                            (value.includes('.safetensors') || value.includes('.ckpt') || value.includes('.pt'))) {
                            modelNames.push({
                                name: value,
                                type: 'Model',
                                priority: 3
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Build the model information string
    if (modelNames.length > 0) {
        // Sort by priority (lower number = higher priority)
        modelNames.sort((a, b) => a.priority - b.priority);
        
        let modelText = '';
        
        if (modelNames.length === 1) {
            // Single model - just use the name, cleaned up
            modelText = cleanModelName(modelNames[0].name);
        } else {
            // Multiple models - show primary + additional info
            const primaryModel = cleanModelName(modelNames[0].name);
            const additionalModels = modelNames.slice(1);
            
            modelText = primaryModel;
            
            // Add LoRAs and other models as additional info
            const loras = additionalModels.filter(m => m.type === 'LoRA');
            if (loras.length > 0) {
                modelText += ` + ${loras.length} LoRA${loras.length > 1 ? 's' : ''}`;
            }
            
            const otherModels = additionalModels.filter(m => m.type !== 'LoRA');
            if (otherModels.length > 0) {
                modelText += ` + ${otherModels.length} additional model${otherModels.length > 1 ? 's' : ''}`;
            }
        }
        
        // Populate the input field
        modelInput.value = modelText;
        console.log(`Extracted model info: ${modelText}`);
    }
}

// Helper function to clean model names
function cleanModelName(modelName) {
    if (!modelName) return '';
    
    // Remove file extensions
    let cleaned = modelName.replace(/\.(safetensors|ckpt|pt)$/i, '');
    
    // Remove common prefixes/paths
    cleaned = cleaned.replace(/^.*[\/\\]/, ''); // Remove path
    cleaned = cleaned.replace(/^SDXL[\/\\]?/i, ''); // Remove SDXL prefix
    
    // Clean up underscores and make more readable
    cleaned = cleaned.replace(/_/g, ' ');
    
    return cleaned.trim();
}

// Extract text from workflow data and populate the AI Prompt field
function extractTextFromWorkflow(workflowData) {
    const promptTextarea = document.getElementById('imagePrompt');
    
    // Only populate if the field is currently empty or contains default text
    if (promptTextarea.value && !promptTextarea.value.includes('aidma-niji, niji, anime style')) {
        return; // Don't overwrite user's manual input
    }
    
    let candidateTexts = [];
    
    // Search through workflow nodes for text
    if (workflowData.nodes && Array.isArray(workflowData.nodes)) {
        for (const node of workflowData.nodes) {
            
            // Priority 1: Look for custom prompt nodes
            if (node.type && node.type.includes('prompt')) {
                if (node.widgets_values && Array.isArray(node.widgets_values)) {
                    for (const value of node.widgets_values) {
                        if (typeof value === 'string' && value.length > 20) {
                            candidateTexts.push({ 
                                text: value, 
                                priority: 1, 
                                source: node.type,
                                label: 'Custom Prompt'
                            });
                        }
                    }
                }
            }
            
            // Priority 2: Look for ShowText nodes (often contain processed prompts)
            if (node.type === 'ShowText|pysssss') {
                if (node.widgets_values && Array.isArray(node.widgets_values)) {
                    for (const value of node.widgets_values) {
                        if (Array.isArray(value) && value.length > 0) {
                            // ShowText often stores text in nested arrays
                            for (const textItem of value) {
                                if (typeof textItem === 'string' && textItem.length > 20) {
                                    candidateTexts.push({ 
                                        text: textItem, 
                                        priority: 2, 
                                        source: node.type,
                                        label: 'Processed Text'
                                    });
                                }
                            }
                        } else if (typeof value === 'string' && value.length > 20) {
                            candidateTexts.push({ 
                                text: value, 
                                priority: 2, 
                                source: node.type,
                                label: 'Processed Text'
                            });
                        }
                    }
                }
            }
            
            // Priority 3: Look for Text Find and Replace nodes (often modify prompts)
            if (node.type === 'Text Find and Replace') {
                if (node.widgets_values && Array.isArray(node.widgets_values)) {
                    // Usually the "replace" text is more useful than "find"
                    if (node.widgets_values.length > 1 && typeof node.widgets_values[1] === 'string' && node.widgets_values[1].length > 20) {
                        candidateTexts.push({ 
                            text: node.widgets_values[1], 
                            priority: 3, 
                            source: node.type,
                            label: 'Replace Text'
                        });
                    }
                }
            }
            
            // Priority 4: Look for CLIPTextEncode nodes (traditional method)
            if (node.type === 'CLIPTextEncode') {
                if (node.widgets_values && Array.isArray(node.widgets_values)) {
                    for (const value of node.widgets_values) {
                        if (typeof value === 'string' && value.length > 10) {
                            // Skip very short/generic text but include embeddings if they're longer
                            if (!value.includes('embedding:') || value.length > 30) {
                                candidateTexts.push({ 
                                    text: value, 
                                    priority: 4, 
                                    source: node.type,
                                    label: value.includes('embedding:') ? 'Negative Prompt' : 'Positive Prompt'
                                });
                            }
                        }
                    }
                }
            }
            
            // Priority 5: Look for other text-related nodes
            if (node.type === 'Text' || node.type === 'TextBox' || (node.type && node.type.includes('Text'))) {
                if (node.widgets_values && Array.isArray(node.widgets_values)) {
                    for (const value of node.widgets_values) {
                        if (typeof value === 'string' && value.length > 20) {
                            candidateTexts.push({ 
                                text: value, 
                                priority: 5, 
                                source: node.type,
                                label: 'Text Node'
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Remove duplicates and very similar text
    const uniqueTexts = [];
    for (const candidate of candidateTexts) {
        const isDuplicate = uniqueTexts.some(existing => 
            existing.text === candidate.text || 
            (existing.text.includes(candidate.text) || candidate.text.includes(existing.text))
        );
        if (!isDuplicate) {
            uniqueTexts.push(candidate);
        }
    }
    
    // Sort by priority (lower number = higher priority) and then by length
    uniqueTexts.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return b.text.length - a.text.length; // Longer text first within same priority
    });
    
    // Build the combined prompt text
    let combinedPrompt = '';
    
    if (uniqueTexts.length === 1) {
        // Single prompt - just use it directly
        combinedPrompt = cleanPromptText(uniqueTexts[0].text);
    } else if (uniqueTexts.length > 1) {
        // Multiple prompts - organize them with labels
        combinedPrompt = '=== MULTIPLE PROMPTS FOUND ===\n\n';
        
        uniqueTexts.forEach((prompt, index) => {
            combinedPrompt += `${index + 1}. ${prompt.label} (${prompt.source}):\n`;
            combinedPrompt += cleanPromptText(prompt.text) + '\n\n';
        });
        
        combinedPrompt += '=== END OF PROMPTS ===\n\n';
        combinedPrompt += `PRIMARY PROMPT:\n${cleanPromptText(uniqueTexts[0].text)}`;
    }
    
    // Populate the textarea if we found text
    if (combinedPrompt) {
        promptTextarea.value = combinedPrompt;
        console.log(`Extracted ${uniqueTexts.length} unique prompts from workflow`);
    }
}

// Helper function to clean prompt text
function cleanPromptText(text) {
    if (!text) return '';
    
    // Remove common prefixes/suffixes that might be added by processing
    let cleaned = text.replace(/^(aidma-niji, niji, anime style, sharp image\s*)/i, '');
    cleaned = cleaned.replace(/\n+/g, ' '); // Replace newlines with spaces
    cleaned = cleaned.trim();
    
    return cleaned;
}

// Download current image's ComfyUI workflow
function downloadCurrentWorkflow() {
    if (!currentImageData || !currentImageData.metadata) {
        alert('No workflow data available for this image!');
        return;
    }
    
    const hasWorkflow = currentImageData.metadata.workflow || currentImageData.metadata.prompt;
    if (!hasWorkflow) {
        alert('No ComfyUI workflow data available for this image!');
        return;
    }
    
    let workflowJson = null;
    let promptJson = null;
    
    // Extract and parse workflow data
    if (currentImageData.metadata.workflow) {
        try {
            workflowJson = JSON.parse(currentImageData.metadata.workflow);
        } catch (e) {
            console.error('Error parsing workflow:', e);
            alert('Error: Invalid workflow data format');
            return;
        }
    }
    
    // Extract and parse prompt data
    if (currentImageData.metadata.prompt) {
        try {
            promptJson = JSON.parse(currentImageData.metadata.prompt);
        } catch (e) {
            console.error('Error parsing prompt:', e);
            // If prompt fails to parse, it's not critical
        }
    }
    
    // Create the export data in ComfyUI's expected format
    let exportData;
    
    if (workflowJson) {
        // Export the raw workflow JSON for ComfyUI import
        exportData = workflowJson;
    } else if (promptJson) {
        // If only prompt data exists, wrap it appropriately
        exportData = {
            prompt: promptJson,
            metadata: {
                exported_from: 'AI Image Gallery',
                image_title: currentImageData.title || 'Untitled',
                export_date: new Date().toISOString()
            }
        };
    } else {
        alert('No valid workflow data found!');
        return;
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (currentImageData.title || 'Untitled').replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `${safeTitle}_workflow.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`✅ Downloaded ComfyUI workflow for "${currentImageData.title || 'Untitled'}"!\n\nThis file can be directly imported into ComfyUI.`);
}

// Save image metadata
async function saveImageMetadata() {
    if (!currentImageId) return;
    
    const updatedData = {
        title: document.getElementById('imageTitle').value,
        prompt: document.getElementById('imagePrompt').value,
        model: document.getElementById('imageModel').value,
        tags: document.getElementById('imageTags').value,
        notes: document.getElementById('imageNotes').value
    };
    
    await db.images.update(currentImageId, updatedData);
    await loadImages();
    document.getElementById('imageModal').style.display = 'none';
}

// Delete current image
async function deleteCurrentImage() {
    if (!currentImageId) return;
    
    if (confirm('Are you sure you want to delete this image?')) {
        await db.images.delete(currentImageId);
        await loadImages();
        updateStats();
        document.getElementById('imageModal').style.display = 'none';
    }
}

// Handle search
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    
    if (!searchTerm) {
        displayImages(allImages);
        return;
    }
    
    const filtered = allImages.filter(image => 
        (image.title || '').toLowerCase().includes(searchTerm) ||
        (image.prompt || '').toLowerCase().includes(searchTerm) ||
        (image.tags || '').toLowerCase().includes(searchTerm) ||
        (image.model || '').toLowerCase().includes(searchTerm)
    );
    
    displayImages(filtered);
}

// Update stats
function updateStats() {
    const count = allImages.length;
    document.getElementById('imageCount').textContent = `${count} image${count !== 1 ? 's' : ''} stored`;
}

// Export all data to JSON file
async function exportAllData() {
    const allData = await db.images.toArray();
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        totalImages: allData.length,
        images: allData
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-image-gallery-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`✅ Exported ${allData.length} images to backup file!`);
}

// Import data from JSON file
async function importAllData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        if (importData.images && Array.isArray(importData.images)) {
            const existingCount = allImages.length;
            
            // Add imported images to database
            for (const image of importData.images) {
                // Remove ID to avoid conflicts
                delete image.id;
                await db.images.add(image);
            }
            
            await loadImages();
            updateStats();
            
            alert(`✅ Imported ${importData.images.length} images! You now have ${allImages.length} total images.`);
        } else {
            alert('❌ Invalid backup file format!');
        }
    } catch (error) {
        alert('❌ Error importing file: ' + error.message);
    }
    
    // Reset file input
    e.target.value = '';
}

// Start the app
init();