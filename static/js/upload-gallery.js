(function () {
  var MAX_FILES = window.UPLOAD_CONFIG.maxUploadImagesCount;
  var MAX_SIZE = window.UPLOAD_CONFIG.maxUploadSizeGallery;

  var dropzone = document.getElementById('galleryDropzone');
  var fileInput = document.getElementById('galleryFileInput');
  var fileList = document.getElementById('fileList');
  var uploadBtn = document.getElementById('uploadBtn');

  var files = [];
  var draggedIndex = null;
  var touchTimer = null;
  var isTouchDragging = false;

  function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + '\u00A0' + sizes[i];
  }

  function render() {
    fileList.innerHTML = '';
    var totalSize = 0;

    files.forEach(function (file, index) {
      totalSize += file.size;

      var item = document.createElement('div');
      item.className = 'file-item';
      item.draggable = true;

      var preview = document.createElement('div');
      preview.className = 'file-preview';

      if (file.type && file.type.startsWith('image/')) {
        var img = document.createElement('img');
        img.className = 'file-thumb';
        img.src = file._preview || '';
        img.draggable = false;
        preview.appendChild(img);
      } else {
        var icon = document.createElement('div');
        icon.className = 'file-thumb file-thumb--icon';
        icon.textContent = '\uD83D\uDDFC';
        preview.appendChild(icon);
      }

      var meta = document.createElement('div');
      meta.className = 'file-meta';

      var name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = file.name;

      var size = document.createElement('span');
      size.className = 'file-size';
      size.textContent = formatSize(file.size);

      meta.appendChild(name);
      meta.appendChild(size);

      var removeBtn = document.createElement('button');
      removeBtn.className = 'file-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '\u00D7';
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        files.splice(index, 1);
        render();
      });

      item.appendChild(preview);
      item.appendChild(meta);
      item.appendChild(removeBtn);

      // --- Drag & drop reorder (desktop) ---
      item.addEventListener('dragstart', function () {
        draggedIndex = index;
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', function () {
        item.classList.remove('dragging');
        draggedIndex = null;
      });

      // --- Touch long-press drag (mobile) ---
      item.addEventListener('touchstart', function (e) {
        touchTimer = setTimeout(function () {
          isTouchDragging = true;
          draggedIndex = index;
          item.classList.add('dragging');
        }, 200);
      });
      item.addEventListener('touchmove', function () {
        clearTimeout(touchTimer);
      });
      item.addEventListener('touchend', function () {
        clearTimeout(touchTimer);
      });
      item.addEventListener('touchcancel', function () {
        clearTimeout(touchTimer);
        isTouchDragging = false;
        item.classList.remove('dragging');
      });

      fileList.appendChild(item);
    });

    // Summary + upload button
    if (files.length === 0) {
      uploadBtn.style.display = 'none';
      return;
    }

    uploadBtn.style.display = 'block';
    if (totalSize > MAX_SIZE) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Error: exceeds ' + formatSize(MAX_SIZE) + ' limit';
    } else if (files.length > MAX_FILES) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Error: exceeds ' + MAX_FILES + ' file limit';
    } else {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' (' + formatSize(totalSize) + ')';
    }
    var pricingError = getPricingError();
    var errorEl = document.getElementById('galleryValidationError');
    if (pricingError) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = pricingError;
      errorEl.textContent = pricingError;
      errorEl.hidden = false;
    } else {
      errorEl.hidden = true;
    }
  }

  function getInsertIndex(container, y) {
    var items = container.querySelectorAll('.file-item:not(.dragging)');
    var closest = null;
    var closestOffset = Number.NEGATIVE_INFINITY;

    items.forEach(function (item) {
      var box = item.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) {
        closestOffset = offset;
        closest = item;
      }
    });

    return closest ? Array.from(container.children).indexOf(closest) : container.children.length;
  }

  // Desktop drag over file list
  fileList.addEventListener('dragover', function (e) {
    e.preventDefault();
    var afterIndex = getInsertIndex(fileList, e.clientY);
    var dragging = document.querySelector('.dragging');
    if (dragging && afterIndex !== null) {
      var target = fileList.children[afterIndex];
      if (target) {
        fileList.insertBefore(dragging, target);
      } else {
        fileList.appendChild(dragging);
      }
    }
  });

  fileList.addEventListener('drop', function (e) {
    e.preventDefault();
    commitReorder();
  });

  // Touch reorder
  fileList.addEventListener('touchmove', function (e) {
    if (isTouchDragging) {
      e.preventDefault();
      var touch = e.touches[0];
      var afterIndex = getInsertIndex(fileList, touch.clientY);
      var dragging = document.querySelector('.dragging');
      if (dragging && afterIndex !== null) {
        var target = fileList.children[afterIndex];
        if (target) {
          fileList.insertBefore(dragging, target);
        } else {
          fileList.appendChild(dragging);
        }
      }
    }
  }, {passive: false});

  fileList.addEventListener('touchend', function (e) {
    if (isTouchDragging) {
      commitReorder();
    }
    clearTimeout(touchTimer);
    isTouchDragging = false;
    var dragging = document.querySelector('.dragging');
    if (dragging) dragging.classList.remove('dragging');
  });

  function commitReorder() {
    var dragging = document.querySelector('.dragging');
    if (!dragging || draggedIndex === null) return;
    var newIndex = Array.from(fileList.children).indexOf(dragging);
    if (newIndex !== -1 && newIndex !== draggedIndex) {
      var item = files.splice(draggedIndex, 1)[0];
      files.splice(newIndex, 0, item);
    }
    draggedIndex = null;
    render();
  }

  function addFiles(newFiles) {
    var remaining = MAX_FILES - files.length;
    if (newFiles.length > remaining) {
      alert('Maximum ' + MAX_FILES + ' files allowed. Adding ' + remaining + ' file' + (remaining === 1 ? '' : 's') + '.');
    }
    var toAdd = Array.from(newFiles).slice(0, remaining);

    toAdd.forEach(function (f) {
      if (f.size > MAX_SIZE) {
        alert('File "' + f.name + '" exceeds the ' + formatSize(MAX_SIZE) + ' limit and will be skipped.');
        return;
      }
      if (f.type && f.type.startsWith('image/')) {
        f._preview = URL.createObjectURL(f);
      }
      files.push(f);
    });

    render();
  }

  /*
    Unblurred images concept:
    - unblurred_count = first N images shown in free preview (unblurred)
    - remaining = total - unblurred_count = blurred until purchase
    - Rule: total >= unblurred_count * 2 (enough blurred behind paywall)
    - unblurred_count range: 1-10
  */
  function getPricingError() {
    var price = parseFloat(document.getElementById('galleryPrice').value) || 0;
    if (price <= 0) return null;
    var unblurred = parseInt(document.getElementById('unblurredCount').value) || 0;
    if (files.length < unblurred * 2) {
      return 'Need at least ' + (unblurred * 2) + ' images for ' + unblurred + ' unblurred';
    }
    return null;
  }

  /*
    When price is set, show the unblurred count selector so the uploader
    can choose how many images to leave unblurred in the free preview.
  */
  function toggleGalleryConditional() {
    var price = parseFloat(document.getElementById('galleryPrice').value) || 0;
    document.getElementById('galleryConditionalFields').hidden = price <= 0;
    var errEl = document.getElementById('galleryValidationError');
    if (price <= 0) errEl.hidden = true;
  }

  document.getElementById('galleryPrice').addEventListener('input', function () {
    toggleGalleryConditional();
    render();
  });

  document.getElementById('unblurredSelector').addEventListener('click', function (e) {
    var btn = e.target.closest('.count-btn');
    if (!btn) return;
    var count = parseInt(btn.dataset.count);
    this.querySelectorAll('.count-btn').forEach(function (b) {
      b.classList.toggle('count-btn--active', parseInt(b.dataset.count) <= count);
    });
    document.getElementById('unblurredCount').value = count;
    render();
  });

  toggleGalleryConditional();

  dropzone.addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', function () {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });

  // Upload with progress
  document.getElementById('uploadForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (getPricingError()) {return;}
    var dropzone = document.getElementById('galleryDropzone');
    var fileListEl = document.getElementById('fileList');
    var progressContainer = document.getElementById('progressContainer');
    var progressFill = document.getElementById('progressFill');

    dropzone.style.display = 'none';
    fileListEl.style.display = 'none';
    progressContainer.hidden = false;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Initializing...';
    this.querySelector('[name="title"]').disabled = true;
    this.querySelector('[name="description"]').disabled = true;

    // Build file entries for the init request
    var fileEntries = files.map(function (f) {
      var ext = f.name.split('.').pop().toLowerCase();
      return {name: f.name, ext: ext, size: f.size};
    });

    // Step 1: Ask backend for presigned URLs
    fetch('/api/upload/gallery/init', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        title: document.querySelector('[name="title"]').value,
        description: document.querySelector('[name="description"]').value || null,
        price_cents: Math.round((parseFloat(document.getElementById('galleryPrice').value) || 0) * 100),
        unblurred_count: parseInt(document.getElementById('unblurredCount').value) || null,
        files: fileEntries,
      })
    })
      .then(function (r) {return r.json().then(function (d) {return {status: r.status, data: d};});})
      .then(function (res) {
        if (res.status < 200 || res.status >= 300 || !res.data.files || !res.data.files.length) {
          alert(res.data.error || 'Failed to initialize upload');
          resetUploadUI();
          return;
        }
        var contentId = res.data.content_id;
        var slug = res.data.slug;
        var uploadFiles = res.data.files;
        var totalFiles = uploadFiles.length;
        var completedFiles = 0;

        // Step 2: Upload each file sequentially to S3
        function uploadNext(index) {
          if (index >= totalFiles) {
            // All done — mark as complete
            fetch('/api/upload/' + contentId + '/complete', {method: 'POST'})
              .then(function (r) {return r.json();})
              .then(function (d) {
                if (d.ok) {
                  window.location.href = '/gallery/' + slug;
                } else {
                  alert(d.error || 'Failed to finalize');
                  resetUploadUI();
                }
              })
              .catch(function () {
                alert('Failed to finalize upload');
                resetUploadUI();
              });
            return;
          }

          var entry = uploadFiles[index];
          var localFile = files[index];
          var xhr = new XMLHttpRequest();

          xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
              var filePct = e.loaded / e.total;
              var overall = (completedFiles + filePct) / totalFiles;
              var pct = Math.round(overall * 100);
              progressFill.style.width = pct + '%';
              uploadBtn.textContent = 'Uploading ' + (index + 1) + '/' + totalFiles + ' (' + pct + '%)';
            }
          });

          xhr.addEventListener('load', function () {
            if (xhr.status >= 200 && xhr.status < 300) {
              completedFiles++;
              uploadNext(index + 1);
            } else {
              alert('Upload failed for ' + entry.file_name + ' (HTTP ' + xhr.status + ')');
              resetUploadUI();
            }
          });

          xhr.addEventListener('error', function () {
            alert('Network error uploading ' + entry.file_name);
            resetUploadUI();
          });

          xhr.open('PUT', entry.upload_url, true);
          xhr.setRequestHeader('Content-Type', localFile.type || 'application/octet-stream');
          xhr.send(localFile);
        }

        uploadNext(0);
      })
      .catch(function (err) {
        alert('Failed to initialize upload');
        resetUploadUI();
      });

    function resetUploadUI() {
      dropzone.style.display = '';
      fileListEl.style.display = '';
      progressContainer.hidden = true;
      progressFill.style.width = '0%';
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload';
      document.querySelector('[name="title"]').disabled = false;
      document.querySelector('[name="description"]').disabled = false;
    }
  });
})();
