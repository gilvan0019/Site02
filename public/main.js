<script>
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const output = document.getElementById('ocrText');

  input.addEventListener('change', () => {
    fileList.innerHTML = '';
    output.value = '';

    const files = Array.from(input.files);

    if (files.length === 0) {
      return;
    }

    files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-item';

      const name = document.createElement('strong');
      name.textContent = file.name;

      const size = document.createElement('span');
      size.textContent = formatSize(file.size);

      item.appendChild(name);
      item.appendChild(size);

      fileList.appendChild(item);
    });
  });

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
});
</script>
