// imageProcessor.js - Handles file upload and metadata extraction

/**
 * Main function to process uploaded files
 * Determines which parser to use based on filename
 */
export async function processFile(file, database) {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Check if this is a ChatGPT image (filename starts with "ChatGPT")
    const isChatGPTImage = file.name.startsWith('ChatGPT');
    
    let aiInfo = {};
    let pngTextChunks = {};
    
    if (isChatGPTImage) {
        // Use ChatGPT-specific parser
        console.log('Processing ChatGPT image:', file.name);
        pngTextChunks = extractPNGTextChunks(uint8Array);
        aiInfo = extractChatGPTInfo(pngTextChunks);
    } else {
        // Use regular ComfyUI parser
        console.log('Processing regular image:', file.name);
        pngTextChunks = extractPNGTextChunks(uint8Array);
        aiInfo = extractComfyUIInfo(pngTextChunks);
    }
    
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
            try {
                const imageData = e.target.result;
                
                const newImage = {
                    title: aiInfo.title || file.name.replace(/\.[^/.]+$/, ''),
                    prompt: aiInfo.prompt || '',
                    model: aiInfo.model || '',
                    tags: aiInfo.tags || '',
                    notes: aiInfo.notes || '',
                    dateAdded: new Date().toISOString(),
                    imageData: imageData,
                    metadata: pngTextChunks
                };

                const imageId = await database.images.add(newImage);
                resolve({ success: true, imageId, imageData: newImage });
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Extract PNG text chunks (tEXt, iTXt, zTXt)
 * This is where ComfyUI and other tools store metadata
 */
function extractPNGTextChunks(uint8Array) {
    const chunks = {};
    
    if (uint8Array[0] !== 0x89 || uint8Array[1] !== 0x50 || uint8Array[2] !== 0x4E || uint8Array[3] !== 0x47) {
        return chunks; // Not a PNG file
    }
    
    let offset = 8; // Skip PNG signature
    
    while (offset < uint8Array.length - 8) {
        // Read chunk length (4 bytes, big-endian)
        const length = (uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) | 
                      (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
        
        // Read chunk type (4 bytes)
        const type = String.fromCharCode(uint8Array[offset + 4], uint8Array[offset + 5], 
                                        uint8Array[offset + 6], uint8Array[offset + 7]);
        
        // Check if it's a text chunk
        if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
            const dataStart = offset + 8;
            const chunkData = uint8Array.slice(dataStart, dataStart + length);
            
            if (type === 'tEXt') {
                const nullIndex = chunkData.indexOf(0);
                if (nullIndex !== -1) {
                    const keyword = new TextDecoder().decode(chunkData.slice(0, nullIndex));
                    const text = new TextDecoder().decode(chunkData.slice(nullIndex + 1));
                    chunks[keyword] = text;
                }
            }
        }
        
        // Move to next chunk
        offset += 8 + length + 4; // length + type + data + CRC
    }
    
    return chunks;
}

/**
 * Extract ChatGPT-specific information from PNG text chunks
 * Handles the special JSON format that ChatGPT images use
 */
function extractChatGPTInfo(chunks) {
    const aiInfo = {
        title: '',
        prompt: '',
        model: '',
        tags: '',
        notes: ''
    };

    // Look for the "prompt" key that contains ChatGPT JSON data
    if (chunks.prompt) {
        try {
            const chatGPTData = JSON.parse(chunks.prompt);
            console.log('ChatGPT data found:', chatGPTData);
            
            // Extract prompt and internal_prompt and combine them
            let combinedPrompt = '';
            
            if (chatGPTData.prompt) {
                combinedPrompt += `USER PROMPT:\n${chatGPTData.prompt}\n\n`;
            }
            
            if (chatGPTData.internal_prompt) {
                combinedPrompt += `INTERNAL PROMPT:\n${chatGPTData.internal_prompt}`;
            }
            
            aiInfo.prompt = combinedPrompt.trim();
            
            // Extract tool information for AI Model
            if (chatGPTData.tool) {
                aiInfo.model = chatGPTData.tool;
            }
            
            // Build detailed notes from ChatGPT metadata
            aiInfo.notes += `🤖 ChatGPT Image Generation\n`;
            aiInfo.notes += `📅 Generated: ${chatGPTData.date_generated || 'Unknown'}\n`;
            
            if (chatGPTData.filename) {
                aiInfo.notes += `📄 Original filename: ${chatGPTData.filename}\n`;
            }
            
            if (chatGPTData.style) {
                aiInfo.notes += `🎨 Style: ${chatGPTData.style}\n`;
            }
            
            if (chatGPTData.aspect_ratio) {
                aiInfo.notes += `📐 Aspect ratio: ${chatGPTData.aspect_ratio}\n`;
            }
            
            if (chatGPTData.resolution) {
                aiInfo.notes += `🔍 Resolution: ${chatGPTData.resolution}\n`;
            }
            
            if (chatGPTData.file_size_mb) {
                aiInfo.notes += `💾 File size: ${chatGPTData.file_size_mb} MB\n`;
            }
            
            if (chatGPTData.source_image) {
                aiInfo.notes += `🖼️ Source image: ${chatGPTData.source_image}\n`;
            }
            
            // Set appropriate tags
            aiInfo.tags = 'ChatGPT,AI-Generated,Image-Gen';
            
            console.log('Extracted ChatGPT info:', aiInfo);
            
        } catch (e) {
            console.error('Error parsing ChatGPT data:', e);
            aiInfo.notes += '🤖 ChatGPT data found but could not parse JSON\n';
            aiInfo.tags = 'ChatGPT,AI-Generated';
        }
    }
    
    return aiInfo;
}

/**
 * Extract ComfyUI-specific information from PNG text chunks
 * Handles workflow and prompt data from ComfyUI
 */
function extractComfyUIInfo(chunks) {
    const aiInfo = {
        title: '',
        prompt: '',
        model: '',
        tags: '',
        notes: ''
    };

    // ComfyUI typically stores workflow in 'workflow' and prompt info in 'prompt'
    if (chunks.workflow) {
        try {
            const workflow = JSON.parse(chunks.workflow);
            
            // Add generation info first
            aiInfo.notes += `📅 Generated: ${new Date().toLocaleDateString()}\n`;
            
            // Handle different workflow structures
            let nodeCount = 0;
            let nodeTypes = new Set();
            
            if (workflow.nodes && Array.isArray(workflow.nodes)) {
                // New workflow format with nodes array
                nodeCount = workflow.nodes.length;
                workflow.nodes.forEach(node => {
                    if (node.type) {
                        nodeTypes.add(node.type);
                    }
                });
            } else if (typeof workflow === 'object') {
                // Old workflow format with direct node objects
                nodeCount = Object.keys(workflow).length;
                for (const nodeId in workflow) {
                    const node = workflow[nodeId];
                    if (node.class_type) {
                        nodeTypes.add(node.class_type);
                    }
                }
            }
            
            aiInfo.notes += `🔧 ComfyUI Workflow detected (${nodeCount} nodes)\n`;
            
            // Add node types to notes if found
            if (nodeTypes.size > 0) {
                const sortedNodeTypes = Array.from(nodeTypes).sort();
                aiInfo.notes += `🔗 Node Types: ${sortedNodeTypes.join(', ')}\n`;
            }
            
            // Try to extract prompt from workflow nodes (new format)
            if (workflow.nodes && Array.isArray(workflow.nodes)) {
                for (const node of workflow.nodes) {
                    if (node.type === 'CLIPTextEncode' && node.widgets_values && node.widgets_values.length > 0) {
                        const text = node.widgets_values[0];
                        if (typeof text === 'string' && text.length > 10 && !aiInfo.prompt) {
                            aiInfo.prompt = text;
                            break;
                        }
                    }
                }
            } else {
                // Try to extract prompt from workflow nodes (old format)
                for (const nodeId in workflow) {
                    const node = workflow[nodeId];
                    if (node.inputs && node.inputs.text && typeof node.inputs.text === 'string') {
                        if (node.inputs.text.length > 10 && !aiInfo.prompt) {
                            aiInfo.prompt = node.inputs.text;
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            aiInfo.notes += '🔧 ComfyUI Workflow data found (raw)\n';
        }
    }

    if (chunks.prompt) {
        try {
            const promptData = JSON.parse(chunks.prompt);
            if (typeof promptData === 'object') {
                // Extract useful info from prompt data
                for (const key in promptData) {
                    if (typeof promptData[key] === 'string' && promptData[key].length > 10 && !aiInfo.prompt) {
                        aiInfo.prompt = promptData[key];
                        break;
                    }
                }
            }
        } catch (e) {
            // If not JSON, treat as plain text
            if (chunks.prompt.length > 5 && !aiInfo.prompt) {
                aiInfo.prompt = chunks.prompt;
            }
        }
    }

    // Check for parameters (AUTOMATIC1111 style)
    if (chunks.parameters) {
        aiInfo.prompt = aiInfo.prompt || chunks.parameters;
        aiInfo.notes += '🤖 A1111 Parameters detected\n';
    }

    // Check for Software/model info
    if (chunks.Software) {
        aiInfo.model = chunks.Software;
    }
    
    if (chunks.software) {
        aiInfo.model = chunks.software;
    }

    // Set tags if we have ComfyUI data
    if (chunks.workflow || chunks.prompt) {
        aiInfo.tags = aiInfo.tags || 'ComfyUI,AI-Generated';
    }
    
    return aiInfo;
}

/**
 * Utility function to handle file selection from input
 */
export function handleFileSelect(fileInput, database, onComplete) {
    const files = Array.from(fileInput.files);
    const promises = files.map(file => processFile(file, database));
    
    Promise.all(promises)
        .then(results => {
            console.log(`Processed ${results.length} files successfully`);
            if (onComplete) onComplete(results);
        })
        .catch(error => {
            console.error('Error processing files:', error);
            alert('Error processing some files: ' + error.message);
        });
}

/**
 * Utility function to handle drag and drop
 */
export function handleFileDrop(event, database, onComplete) {
    event.preventDefault();
    
    const files = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    const promises = files.map(file => processFile(file, database));
    
    Promise.all(promises)
        .then(results => {
            console.log(`Processed ${results.length} files via drag & drop`);
            if (onComplete) onComplete(results);
        })
        .catch(error => {
            console.error('Error processing dropped files:', error);
            alert('Error processing some files: ' + error.message);
        });
}