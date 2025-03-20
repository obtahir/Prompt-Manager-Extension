document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('promptInput');
    const inputContainer = document.getElementById('inputContainer');
    const savePromptButton = document.getElementById('savePrompt');
    const addPromptButton = document.getElementById('addPromptBtn');
    const savedPromptsContainer = document.getElementById('savedPrompts');
    const searchBox = document.getElementById('searchBox');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsDropdown = document.getElementById('settingsDropdown');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const allPromptsFilter = document.getElementById('allPromptsFilter');
    const favoritesFilter = document.getElementById('favoritesFilter');

    // Filter state
    let currentFilter = 'all'; // 'all' or 'favorites'
    let currentSearchQuery = '';

    // First, migrate any existing prompts to have unique IDs
    migratePromptsToHaveIds(() => {
        // Then load the prompts
        loadSavedPrompts();
    });

    // Toggle input container visibility and button appearance
    function toggleInputContainer() {
        const isHidden = inputContainer.classList.contains('hidden');
        
        if (isHidden) {
            // Show input container
            
            // Prevent layout shifts by setting a fixed height on the container
            const containerHeight = document.querySelector('.container').offsetHeight;
            document.querySelector('.container').style.minHeight = `${containerHeight}px`;
            
            inputContainer.classList.remove('hidden');
            // Change + to × by adding the 'close' class
            addPromptButton.classList.add('close');
            addPromptButton.title = "Cancel";
            
            // Wait for the animation to complete before focusing
            setTimeout(() => {
                promptInput.focus();
            }, 300); // Match the transition duration in CSS
        } else {
            // Hide input container
            inputContainer.classList.add('hidden');
            // Change × back to + by removing the 'close' class
            addPromptButton.classList.remove('close');
            addPromptButton.title = "Add New Prompt";
            // Clear the input field
            promptInput.value = '';
            
            // Reset the container's minimum height after the animation completes
            setTimeout(() => {
                // Reset to the default minimum height from CSS
                document.querySelector('.container').style.minHeight = '';
                // Force a layout update
                updateLayout();
            }, 300); // Match the transition duration in CSS
        }
    }

    // Add button click handler - toggles the input container
    addPromptButton.addEventListener('click', toggleInputContainer);

    // Save button click handler
    savePromptButton.addEventListener('click', () => {
        if (promptInput.value.trim()) {
            savePromptHandler();
            // Hide the input container after saving
            toggleInputContainer();
        } else {
            showNotification("Please enter a prompt");
        }
    });

    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (promptInput.value.trim()) {
                savePromptHandler();
                // Hide the input container after saving
                toggleInputContainer();
            } else {
                showNotification("Please enter a prompt");
            }
        } else if (e.key === 'Escape') {
            // Hide the input container when Escape is pressed
            toggleInputContainer();
        }
    });

    searchBox.addEventListener('input', () => {
        currentSearchQuery = searchBox.value.toLowerCase();
        applyFilters();
    });

    settingsBtn.addEventListener('click', function() {
        settingsDropdown.classList.toggle('show');
    });

    exportBtn.addEventListener('click', exportPrompts);
    importBtn.addEventListener('click', importPrompts);

    // Close the dropdown if clicked outside
    window.addEventListener('click', function(event) {
        if (!event.target.matches('.settings-icon')) {
            if (settingsDropdown.classList.contains('show')) {
                settingsDropdown.classList.remove('show');
            }
        }
    });

    // Filter event listeners
    allPromptsFilter.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentFilter !== 'all') {
            currentFilter = 'all';
            updateFilterUI();
            applyFilters();
        }
    });
    
    favoritesFilter.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentFilter !== 'favorites') {
            currentFilter = 'favorites';
            updateFilterUI();
            applyFilters();
        }
    });

    // Variables to store the notification state
    let notificationTimeout;
    let currentNotification = '';

    // Function to sanitize user input to prevent XSS
    function sanitizeInput(input) {
        if (!input) return '';
        
        // Create a temporary div element
        const tempDiv = document.createElement('div');
        
        // Set the div's text content to the input (this escapes HTML)
        tempDiv.textContent = input;
        
        // Return the escaped HTML as a string
        return tempDiv.textContent;
    }

    function savePromptHandler() {
        const promptText = promptInput.value.trim();
        if (promptText) {
            const title = prompt('Enter a title for this prompt:');
            if (title) {
                // Sanitize both title and text before saving
                savePrompt(sanitizeInput(title), sanitizeInput(promptText));
                promptInput.value = '';
            }
        }
    }

    function savePrompt(title, text) {
        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            
            // Check if prompts have been manually ordered
            const hasManuallyOrderedPrompts = prompts.some(p => p.manuallyOrdered);
            
            // If prompts have been manually ordered, reset the flag for all prompts
            // This ensures new prompts appear at the top
            if (hasManuallyOrderedPrompts) {
                prompts.forEach(prompt => {
                    delete prompt.manuallyOrdered;
                });
            }
            
            // Generate a unique ID for the prompt
            const uniqueId = 'prompt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Add new prompt with a timestamp and unique ID
            prompts.unshift({ 
                id: uniqueId,
                title, 
                text, 
                favorite: false,
                createdAt: Date.now() // Add timestamp for sorting
            });
            
            chrome.storage.sync.set({ prompts }, () => {
                loadSavedPrompts();
                // Update layout after adding a new prompt
                setTimeout(updateLayout, 50); // Small delay to ensure DOM is updated
            });
        });
    }

    function loadSavedPrompts() {
        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            applyFilters();
        });
    }

    function renderPrompts(prompts) {
        savedPromptsContainer.innerHTML = '';
        
        // Create a copy of the prompts array to avoid modifying the original
        const promptsToRender = [...prompts];
        
        // Check if any prompts have been manually ordered
        const hasManuallyOrderedPrompts = promptsToRender.some(p => p.manuallyOrdered);
        
        // First, separate favorites from non-favorites
        const favoritePrompts = promptsToRender.filter(p => p.favorite);
        const nonFavoritePrompts = promptsToRender.filter(p => !p.favorite);
        
        // Sort favorite prompts by favoritedAt timestamp (most recent first)
        favoritePrompts.sort((a, b) => {
            const aTime = a.favoritedAt || 0;
            const bTime = b.favoritedAt || 0;
            return bTime - aTime; // Descending order (most recent first)
        });
        
        // For non-favorites, respect manual ordering if present
        if (hasManuallyOrderedPrompts) {
            // Keep manually ordered non-favorites in their current order
            // Only sort non-manually ordered prompts by createdAt
            const manuallyOrderedNonFavorites = nonFavoritePrompts.filter(p => p.manuallyOrdered);
            const autoOrderedNonFavorites = nonFavoritePrompts.filter(p => !p.manuallyOrdered);
            
            // Sort auto-ordered non-favorites by createdAt
            autoOrderedNonFavorites.sort((a, b) => {
                const aTime = a.createdAt || 0;
                const bTime = b.createdAt || 0;
                return bTime - aTime; // Descending order (most recent first)
            });
            
            // Combine the arrays: favorites first, then manually ordered non-favorites, then auto-ordered non-favorites
            const combinedPrompts = [...favoritePrompts, ...manuallyOrderedNonFavorites, ...autoOrderedNonFavorites];
            
            // Render each prompt with its NEW index in the sorted array
            combinedPrompts.forEach((prompt, index) => {
                const promptElement = createPromptElement(prompt, index);
                savedPromptsContainer.appendChild(promptElement);
            });
        } else {
            // If no manual ordering, just sort non-favorites by createdAt
            nonFavoritePrompts.sort((a, b) => {
                const aTime = a.createdAt || 0;
                const bTime = b.createdAt || 0;
                return bTime - aTime; // Descending order (most recent first)
            });
            
            // Combine the arrays: favorites first, then non-favorites
            const combinedPrompts = [...favoritePrompts, ...nonFavoritePrompts];
            
            // Render each prompt with its NEW index in the sorted array
            combinedPrompts.forEach((prompt, index) => {
                const promptElement = createPromptElement(prompt, index);
                savedPromptsContainer.appendChild(promptElement);
            });
        }
        
        setupDragAndDrop();
        
        // Update layout to ensure footer spacing is correct
        updateLayout();
    }

    function createPromptElement(prompt, index) {
        // Sanitize the prompt data for display
        const sanitizedTitle = sanitizeInput(prompt.title);
        
        const promptItem = document.createElement('div');
        promptItem.className = 'prompt-item';
        promptItem.draggable = true;
        promptItem.dataset.index = index;
        
        // Store the prompt ID if it exists (for older prompts, we'll add IDs later)
        if (prompt.id) {
            promptItem.dataset.id = prompt.id;
        }
        
        const titleContainer = document.createElement('div');
        titleContainer.className = 'title-container';
        
        const titleElement = document.createElement('div');
        titleElement.className = 'prompt-title';
        titleElement.textContent = sanitizedTitle; // Use textContent for safe insertion
        
        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = prompt.favorite ? 'icon-btn favorite-btn active' : 'icon-btn favorite-btn';
        favoriteBtn.title = prompt.favorite ? 'Remove from favorites' : 'Add to favorites';
        favoriteBtn.innerHTML = prompt.favorite ? '❤️' : '🤍';
        
        // Store both index and ID (if available) on the button
        favoriteBtn.dataset.index = index;
        if (prompt.id) {
            favoriteBtn.dataset.id = prompt.id;
        }
        
        titleContainer.appendChild(titleElement);
        titleContainer.appendChild(favoriteBtn);
        
        // Create action buttons container
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'prompt-actions';
        
        // Create copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'icon-btn copy-btn';
        copyBtn.title = 'Copy';
        copyBtn.innerHTML = '📋';
        
        // Create edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'icon-btn edit-btn';
        editBtn.title = 'Edit';
        editBtn.innerHTML = '✏️';
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn delete-btn';
        deleteBtn.title = 'Delete';
        deleteBtn.innerHTML = '🗑️';
        
        // Add buttons to actions container
        actionsContainer.appendChild(copyBtn);
        actionsContainer.appendChild(editBtn);
        actionsContainer.appendChild(deleteBtn);
        
        // Add containers to prompt item
        promptItem.appendChild(titleContainer);
        promptItem.appendChild(actionsContainer);

        // Add event listeners
        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Prefer using ID if available, fall back to index
            if (e.target.dataset.id) {
                toggleFavoriteById(e.target.dataset.id);
            } else {
                // Legacy support for prompts without IDs
                const buttonIndex = parseInt(e.target.dataset.index);
                toggleFavorite(buttonIndex);
            }
        });

        copyBtn.addEventListener('click', (e) => {
            // Sanitize text before copying to clipboard (though this is likely unnecessary)
            navigator.clipboard.writeText(sanitizeInput(prompt.text));
            showNotification('Copied!');
        });

        editBtn.addEventListener('click', () => {
            editPrompt(promptItem, prompt, index);
        });

        deleteBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this prompt?')) {
                if (prompt.id) {
                    deletePromptById(prompt.id);
                } else {
                    deletePrompt(index);
                }
            }
        });

        return promptItem;
    }

    function editPrompt(promptElement, prompt, index) {
        console.log(`Editing prompt at index: ${index}`, JSON.stringify(prompt));
        
        // Create a deep copy of the prompt to avoid modifying the original until save
        const promptCopy = JSON.parse(JSON.stringify(prompt));
        
        // Clear the prompt element
        promptElement.innerHTML = '';
        promptElement.classList.add('edit-mode');
        promptElement.dataset.index = index;
        
        // Store the prompt ID if it exists
        if (promptCopy.id) {
            promptElement.dataset.id = promptCopy.id;
        }
        
        // Create title container
        const titleContainer = document.createElement('div');
        titleContainer.className = 'edit-title-container';
        
        // Create title input
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'edit-title';
        titleInput.value = sanitizeInput(promptCopy.title);
        
        // Create favorite button
        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = `icon-btn edit-favorite-btn ${promptCopy.favorite ? 'active' : ''}`;
        favoriteBtn.title = promptCopy.favorite ? 'Remove from favorites' : 'Add to favorites';
        favoriteBtn.innerHTML = promptCopy.favorite ? '❤️' : '🤍';
        
        // Store both index and ID (if available) on the button
        favoriteBtn.dataset.index = index;
        if (promptCopy.id) {
            favoriteBtn.dataset.id = promptCopy.id;
        }
        
        // Create text area
        const textArea = document.createElement('textarea');
        textArea.className = 'edit-text';
        textArea.value = sanitizeInput(promptCopy.text);
        
        // Create actions container
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'prompt-actions';
        
        // Create save button
        const saveBtn = document.createElement('button');
        saveBtn.className = 'icon-btn save-edit-btn';
        saveBtn.title = 'Save';
        saveBtn.innerHTML = '💾';
        
        // Create cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'icon-btn cancel-edit-btn';
        cancelBtn.title = 'Cancel';
        cancelBtn.innerHTML = '❌';
        
        // Add elements to containers
        titleContainer.appendChild(titleInput);
        titleContainer.appendChild(favoriteBtn);
        actionsContainer.appendChild(saveBtn);
        actionsContainer.appendChild(cancelBtn);
        
        // Add containers to prompt element
        promptElement.appendChild(titleContainer);
        promptElement.appendChild(textArea);
        promptElement.appendChild(actionsContainer);

        // Add event listeners
        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasFavorite = promptCopy.favorite;
            promptCopy.favorite = !wasFavorite;
            favoriteBtn.innerHTML = promptCopy.favorite ? '❤️' : '🤍';
            favoriteBtn.title = promptCopy.favorite ? 'Remove from favorites' : 'Add to favorites';
            favoriteBtn.classList.toggle('active', promptCopy.favorite);
            
            // If favorited, add timestamp and remove manual ordering flag
            if (promptCopy.favorite) {
                promptCopy.favoritedAt = Date.now();
                delete promptCopy.manuallyOrdered;
                console.log(`Prompt favorited in edit mode at: ${promptCopy.favoritedAt}`);
            } else {
                // When unfavoriting, preserve position with manual ordering
                promptCopy.manuallyOrdered = true;
                delete promptCopy.favoritedAt;
                console.log(`Prompt unfavorited in edit mode, position will be preserved`);
            }
        });

        saveBtn.addEventListener('click', (e) => {
            const newTitle = titleInput.value;
            const newText = textArea.value;
            
            // Prefer using ID if available, fall back to index
            if (promptCopy.id) {
                updatePromptById(
                    promptCopy.id, 
                    sanitizeInput(newTitle), 
                    sanitizeInput(newText), 
                    promptCopy.favorite, 
                    promptCopy.favoritedAt
                );
            } else {
                // Legacy support for prompts without IDs
                updatePrompt(
                    index, 
                    sanitizeInput(newTitle), 
                    sanitizeInput(newText), 
                    promptCopy.favorite, 
                    promptCopy.favoritedAt
                );
            }
            
            showButtonEffect(e.target, 'Saved!');
        });

        cancelBtn.addEventListener('click', () => {
            loadSavedPrompts();
        });
    }

    function updatePrompt(index, newTitle, newText, favorite, favoritedAt) {
        console.log(`Updating prompt at index: ${index}, favorite: ${favorite}, favoritedAt: ${favoritedAt}`);
        
        // Input should already be sanitized by the calling function,
        // but we'll sanitize again as a defense in depth measure
        const sanitizedTitle = sanitizeInput(newTitle);
        const sanitizedText = sanitizeInput(newText);
        
        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            
            // Ensure the index is valid
            if (index < 0 || index >= prompts.length) {
                console.error(`Invalid index in updatePrompt: ${index}. Prompts length: ${prompts.length}`);
                return;
            }
            
            // Preserve the original createdAt timestamp
            const originalPrompt = prompts[index];
            console.log(`Original prompt:`, JSON.stringify(originalPrompt));
            
            // Create the updated prompt
            prompts[index] = { 
                title: sanitizedTitle, 
                text: sanitizedText, 
                favorite: favorite || false,
                // Preserve timestamps
                createdAt: originalPrompt.createdAt || Date.now()
            };
            
            // Only add favoritedAt if the prompt is a favorite
            if (favorite) {
                prompts[index].favoritedAt = favoritedAt || Date.now();
            }
            
            console.log(`Updated prompt:`, JSON.stringify(prompts[index]));
            
            chrome.storage.sync.set({ prompts }, () => {
                loadSavedPrompts();
            });
        });
    }

    function deletePrompt(index) {
        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            prompts.splice(index, 1);
            chrome.storage.sync.set({ prompts }, () => {
                loadSavedPrompts();
                // Update layout after deleting a prompt
                setTimeout(updateLayout, 50); // Small delay to ensure DOM is updated
            });
        });
    }

    function showButtonEffect(button, text) {
        const originalText = button.textContent;
        button.textContent = text;
        button.classList.add('button-effect');
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('button-effect');
        }, 1000);
    }

    function showNotification(message) {
        const notification = document.getElementById('notification');
        console.log('Notification element:', notification, 'Message:', message);
        
        // Clear any existing timeout
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
        }
        
        // If this is a different notification than what's currently showing,
        // update the text without affecting visibility
        if (message !== currentNotification) {
            notification.textContent = message;
            currentNotification = message;
        }
        
        // Ensure the notification is visible
        if (!notification.classList.contains('visible')) {
            notification.classList.add('visible');
        }
        
        // Set a new timeout to hide the notification after 2 seconds
        notificationTimeout = setTimeout(() => {
            notification.classList.remove('visible');
            notificationTimeout = null;
            
            // Reset the current notification after the transition ends
            setTimeout(() => {
                currentNotification = '';
            }, 300); // Match the transition duration in CSS
        }, 2000);
    }

    function updateFilterUI() {
        // Update active class on filter links
        allPromptsFilter.classList.toggle('active', currentFilter === 'all');
        favoritesFilter.classList.toggle('active', currentFilter === 'favorites');
    }
    
    function applyFilters() {
        chrome.storage.sync.get(['prompts'], (result) => {
            const allPrompts = result.prompts || [];
            
            // Apply search filter
            let filteredPrompts = allPrompts;
            if (currentSearchQuery) {
                filteredPrompts = allPrompts.filter(prompt => 
                    prompt.title.toLowerCase().includes(currentSearchQuery) || 
                    prompt.text.toLowerCase().includes(currentSearchQuery)
                );
            }
            
            // Apply favorites filter
            if (currentFilter === 'favorites') {
                filteredPrompts = filteredPrompts.filter(prompt => prompt.favorite);
            }
            
            renderPrompts(filteredPrompts);
        });
    }

    function filterPrompts(query) {
        currentSearchQuery = query;
        applyFilters();
    }

    function setupDragAndDrop() {
        const promptItems = document.querySelectorAll('.prompt-item');
        let draggedItem = null;

        promptItems.forEach(item => {
            item.addEventListener('dragstart', dragStart);
            item.addEventListener('dragenter', dragEnter);
            item.addEventListener('dragover', dragOver);
            item.addEventListener('dragleave', dragLeave);
            item.addEventListener('drop', drop);
            item.addEventListener('dragend', dragEnd);
        });

        function dragStart(e) {
            draggedItem = this;
            setTimeout(() => this.style.opacity = '0.5', 0);
        }

        function dragEnter(e) {
            e.preventDefault();
            
            // Only add drag-over class if both items are of the same type
            if (draggedItem) {
                const draggedIsFavorite = draggedItem.querySelector('.favorite-btn').classList.contains('active');
                const targetIsFavorite = this.querySelector('.favorite-btn').classList.contains('active');
                
                if (draggedIsFavorite === targetIsFavorite) {
                    this.classList.add('drag-over');
                } else {
                    this.classList.add('drag-invalid');
                }
            }
        }

        function dragOver(e) {
            e.preventDefault();
            
            // Only add drag-over class if both items are of the same type
            if (draggedItem) {
                const draggedIsFavorite = draggedItem.querySelector('.favorite-btn').classList.contains('active');
                const targetIsFavorite = this.querySelector('.favorite-btn').classList.contains('active');
                
                if (draggedIsFavorite === targetIsFavorite) {
                    this.classList.add('drag-over');
                } else {
                    this.classList.add('drag-invalid');
                }
            }
        }

        function dragLeave(e) {
            this.classList.remove('drag-over');
            this.classList.remove('drag-invalid');
        }

        function drop(e) {
            this.classList.remove('drag-over');
            this.classList.remove('drag-invalid');
            
            if (this !== draggedItem) {
                const allItems = Array.from(savedPromptsContainer.querySelectorAll('.prompt-item'));
                const draggedIndex = allItems.indexOf(draggedItem);
                const droppedIndex = allItems.indexOf(this);
                
                // Get the favorite status of both items
                const draggedIsFavorite = draggedItem.querySelector('.favorite-btn').classList.contains('active');
                const droppedIsFavorite = this.querySelector('.favorite-btn').classList.contains('active');
                
                // Only allow reordering if both items are of the same type (both favorited or both non-favorited)
                if (draggedIsFavorite === droppedIsFavorite) {
                    if (draggedIndex < droppedIndex) {
                        savedPromptsContainer.insertBefore(draggedItem, this.nextSibling);
                    } else {
                        savedPromptsContainer.insertBefore(draggedItem, this);
                    }
                    
                    updatePromptOrder();
                } else {
                    // If trying to mix favorited and non-favorited, reset the opacity of the dragged item
                    draggedItem.style.opacity = '1';
                }
            }
        }

        function dragEnd(e) {
            this.style.opacity = '1';
            promptItems.forEach(item => {
                item.classList.remove('drag-over');
                item.classList.remove('drag-invalid');
            });
        }
    }

    function updatePromptOrder() {
        const promptItems = Array.from(savedPromptsContainer.querySelectorAll('.prompt-item'));
        
        // Get the new order of prompts using IDs if available, falling back to indices
        const newOrder = promptItems.map(item => {
            // Prefer using ID if available
            if (item.dataset.id) {
                return { id: item.dataset.id, index: parseInt(item.dataset.index) };
            }
            // Fall back to index for legacy prompts
            return { index: parseInt(item.dataset.index) };
        });
        
        console.log('New order:', newOrder);

        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            
            // Create a new array with the prompts in the user's desired order
            const reorderedPrompts = [];
            
            // First, process items with IDs
            for (const item of newOrder) {
                if (item.id) {
                    // Find the prompt with this ID
                    const promptIndex = prompts.findIndex(p => p.id === item.id);
                    if (promptIndex !== -1) {
                        // Add the prompt to the reordered array with the manuallyOrdered flag
                        reorderedPrompts.push({
                            ...prompts[promptIndex],
                            manuallyOrdered: true
                        });
                    }
                } else {
                    // For legacy prompts without IDs, use the index
                    if (item.index >= 0 && item.index < prompts.length) {
                        // Find the prompt that hasn't been added yet
                        const remainingPrompts = prompts.filter(p => !reorderedPrompts.some(rp => rp.id && rp.id === p.id));
                        if (item.index < remainingPrompts.length) {
                            reorderedPrompts.push({
                                ...remainingPrompts[item.index],
                                manuallyOrdered: true
                            });
                        }
                    }
                }
            }
            
            // Check if we have all prompts
            if (reorderedPrompts.length === prompts.length) {
                console.log('Reordered prompts:', reorderedPrompts);
                
                chrome.storage.sync.set({ prompts: reorderedPrompts }, () => {
                    // Don't call loadSavedPrompts here to avoid re-sorting
                    // Just update the dataset values to match the new order
                    promptItems.forEach((item, index) => {
                        // Update the index
                        item.dataset.index = index;
                        
                        // Update all buttons with the new index
                        const buttons = item.querySelectorAll('button[data-index]');
                        buttons.forEach(button => {
                            button.dataset.index = index;
                        });
                    });
                });
            } else {
                console.error('Reordering failed: mismatch in prompt count. Expected:', prompts.length, 'Got:', reorderedPrompts.length);
                // Reload to restore correct state
                loadSavedPrompts();
            }
        });
    }

    function exportPrompts() {
        chrome.storage.sync.get(['prompts'], function(result) {
            const prompts = result.prompts || [];
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(prompts));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "prompts_backup.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });
    }

    function importPrompts() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.readAsText(file, 'UTF-8');
            reader.onload = readerEvent => {
                const content = readerEvent.target.result;
                let prompts = JSON.parse(content);
                
                // Ensure all imported prompts have the favorite property
                // and favoritedAt property if they are favorites
                prompts = prompts.map(prompt => {
                    const updatedPrompt = {
                        ...prompt,
                        favorite: prompt.favorite || false
                    };
                    
                    // If it's a favorite but doesn't have a favoritedAt timestamp,
                    // add one now (slightly older than current time to preserve order)
                    if (updatedPrompt.favorite && !updatedPrompt.favoritedAt) {
                        updatedPrompt.favoritedAt = Date.now() - 1000; // 1 second ago
                    }
                    
                    return updatedPrompt;
                });
                
                chrome.storage.sync.set({ prompts }, function() {
                    loadSavedPrompts();
                    alert('Prompts imported successfully!');
                });
            }
        }
        input.click();
    }

    function toggleFavorite(index) {
        console.log(`Toggling favorite for prompt at index: ${index}`);
        
        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            
            // Ensure the index is valid
            if (index < 0 || index >= prompts.length) {
                console.error(`Invalid index: ${index}. Prompts length: ${prompts.length}`);
                return;
            }
            
            // Get the prompt at the specified index
            const prompt = prompts[index];
            console.log(`Prompt before toggle:`, JSON.stringify(prompt));
            
            // Toggle the favorite status
            const wasFavorite = prompt.favorite;
            prompt.favorite = !wasFavorite;
            
            // Add a timestamp when favorited, remove it when unfavorited
            if (prompt.favorite) {
                prompt.favoritedAt = Date.now();
                // Show notification when favorited
                showNotification("Favorited!");
                console.log(`Prompt favorited at: ${prompt.favoritedAt}`);
                
                // When favoriting, we DON'T reset manual ordering of other prompts
                // We only need to ensure this prompt is not manually ordered
                // so it goes to the appropriate position in the favorites section
                delete prompt.manuallyOrdered;
            } else {
                // When unfavoriting, we want to preserve the position
                // So we'll mark this prompt as manually ordered
                prompt.manuallyOrdered = true;
                
                // We still need to remove the favoritedAt timestamp
                delete prompt.favoritedAt;
                showNotification("Removed from favorites");
                console.log(`Prompt unfavorited, position preserved`);
            }
            
            console.log(`Prompt after toggle:`, JSON.stringify(prompt));
            
            chrome.storage.sync.set({ prompts }, () => {
                loadSavedPrompts();
            });
        });
    }

    function toggleFavoriteById(id) {
        console.log(`Toggling favorite for prompt with ID: ${id}`);
        
        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            
            // Find the prompt with the specified ID
            const promptIndex = prompts.findIndex(p => p.id === id);
            if (promptIndex === -1) {
                console.error(`Prompt with ID ${id} not found`);
                return;
            }
            
            const prompt = prompts[promptIndex];
            console.log(`Prompt before toggle:`, JSON.stringify(prompt));
            
            // Toggle the favorite status
            const wasFavorite = prompt.favorite;
            prompt.favorite = !wasFavorite;
            
            // Add a timestamp when favorited, remove it when unfavorited
            if (prompt.favorite) {
                prompt.favoritedAt = Date.now();
                // Show notification when favorited
                showNotification("Favorited!");
                console.log(`Prompt favorited at: ${prompt.favoritedAt}`);
                
                // When favoriting, we DON'T reset manual ordering of other prompts
                // We only need to ensure this prompt is not manually ordered
                // so it goes to the appropriate position in the favorites section
                delete prompt.manuallyOrdered;
            } else {
                // When unfavoriting, we want to preserve the position
                // So we'll mark this prompt as manually ordered
                prompt.manuallyOrdered = true;
                
                // We still need to remove the favoritedAt timestamp
                delete prompt.favoritedAt;
                showNotification("Removed from favorites");
                console.log(`Prompt unfavorited, position preserved`);
            }
            
            console.log(`Prompt after toggle:`, JSON.stringify(prompt));
            
            chrome.storage.sync.set({ prompts }, () => {
                loadSavedPrompts();
            });
        });
    }

    function deletePromptById(id) {
        console.log(`Deleting prompt with ID: ${id}`);
        
        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            
            // Find the index of the prompt with the specified ID
            const index = prompts.findIndex(p => p.id === id);
            if (index !== -1) {
                // Remove the prompt from the array
                const removedPrompt = prompts.splice(index, 1)[0];
                console.log(`Prompt removed:`, JSON.stringify(removedPrompt));
                
                // Update the dataset.index values for the remaining prompts
                const updatedPrompts = prompts.map((prompt, newIndex) => ({
                    ...prompt,
                    manuallyOrdered: false,
                    createdAt: Date.now() // Assuming the new prompt is added at the end
                }));
                
                console.log(`Updated prompts:`, JSON.stringify(updatedPrompts));
                
                chrome.storage.sync.set({ prompts: updatedPrompts }, () => {
                    loadSavedPrompts();
                    // Update layout after deleting a prompt
                    setTimeout(updateLayout, 50); // Small delay to ensure DOM is updated
                });
            } else {
                console.error(`Prompt with ID ${id} not found`);
            }
        });
    }

    function updatePromptById(id, newTitle, newText, favorite, favoritedAt) {
        console.log(`Updating prompt with ID: ${id}, favorite: ${favorite}, favoritedAt: ${favoritedAt}`);
        
        // Input should already be sanitized by the calling function
        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            
            // Find the prompt with the specified ID
            const promptIndex = prompts.findIndex(p => p.id === id);
            if (promptIndex === -1) {
                console.error(`Prompt with ID ${id} not found`);
                return;
            }
            
            // Preserve the original createdAt timestamp
            const originalPrompt = prompts[promptIndex];
            console.log(`Original prompt:`, JSON.stringify(originalPrompt));
            
            // Create the updated prompt
            prompts[promptIndex] = { 
                ...originalPrompt, // Keep all original properties including the ID
                title: newTitle, 
                text: newText, 
                favorite: favorite || false,
                // Preserve timestamps
                createdAt: originalPrompt.createdAt || Date.now()
            };
            
            // Only add favoritedAt if the prompt is a favorite
            if (favorite) {
                prompts[promptIndex].favoritedAt = favoritedAt || Date.now();
            } else {
                delete prompts[promptIndex].favoritedAt;
            }
            
            console.log(`Updated prompt:`, JSON.stringify(prompts[promptIndex]));
            
            chrome.storage.sync.set({ prompts }, () => {
                loadSavedPrompts();
            });
        });
    }

    function migratePromptsToHaveIds(callback) {
        console.log('Checking if prompts need migration to have unique IDs...');
        
        chrome.storage.sync.get(['prompts'], (result) => {
            const prompts = result.prompts || [];
            
            // Check if any prompts don't have IDs
            const promptsWithoutIds = prompts.filter(p => !p.id);
            
            if (promptsWithoutIds.length > 0) {
                console.log(`Found ${promptsWithoutIds.length} prompts without IDs. Migrating...`);
                
                // Add IDs to prompts that don't have them
                const updatedPrompts = prompts.map(prompt => {
                    if (!prompt.id) {
                        return {
                            ...prompt,
                            id: 'prompt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
                        };
                    }
                    return prompt;
                });
                
                // Save the updated prompts
                chrome.storage.sync.set({ prompts: updatedPrompts }, () => {
                    console.log('Migration complete. All prompts now have unique IDs.');
                    if (callback) callback();
                });
            } else {
                console.log('No migration needed. All prompts already have unique IDs.');
                if (callback) callback();
            }
        });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "reloadPrompts") {
            loadSavedPrompts();
        }
    });

    // Function to update layout and ensure footer spacing is correct
    function updateLayout() {
        // Get the main elements
        const container = document.querySelector('.container');
        const savedPromptsContainer = document.querySelector('.saved-prompts-container');
        const footer = document.querySelector('.footer');
        const footerSpacer = document.querySelector('.footer-spacer');
        
        if (container && savedPromptsContainer && footer && footerSpacer) {
            // Set a minimum height for the saved prompts container
            savedPromptsContainer.style.minHeight = '50px';
            
            // Ensure the footer spacer is visible
            footerSpacer.style.display = 'block';
            
            // Force a reflow to ensure all elements are properly sized
            void container.offsetHeight;
            void savedPromptsContainer.offsetHeight;
            void footer.offsetHeight;
            void footerSpacer.offsetHeight;
            
            // Ensure the container has a minimum height
            const minContainerHeight = 300;
            if (container.offsetHeight < minContainerHeight) {
                container.style.minHeight = `${minContainerHeight}px`;
            }
        }
    }
});