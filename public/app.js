// Resume Roaster - Frontend Application
// ES Module - Vanilla JS, no dependencies

// === DOM Elements ===
const inputSection = document.getElementById('input-section');
const loadingSection = document.getElementById('loading-section');
const resultsSection = document.getElementById('results-section');
const errorSection = document.getElementById('error-section');

const resumeTextarea = document.getElementById('resume-text');
const wordCountDisplay = document.getElementById('word-count-display');
const wordCountHint = document.getElementById('word-count-hint');
const wordCountContainer = resumeTextarea?.parentElement?.querySelector('.word-count');

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const dropzoneContent = dropzone?.querySelector('.dropzone__content');
const dropzoneFile = document.getElementById('dropzone-file');
const dropzoneFilename = document.getElementById('dropzone-filename');
const dropzoneClear = document.getElementById('dropzone-clear');

const targetRoleInput = document.getElementById('target-role');
const roastBtn = document.getElementById('roast-btn');

const loadingMessage = document.getElementById('loading-message');

const scoreValue = document.getElementById('score-value');
const resultHeadline = document.getElementById('result-headline');
const topFixesList = document.getElementById('top-fixes-list');
const sectionsContainer = document.getElementById('sections-container');
const strengthsPanel = document.getElementById('strengths-panel');
const strengthsList = document.getElementById('strengths-list');
const atsPanel = document.getElementById('ats-panel');
const atsList = document.getElementById('ats-list');

const exportBtn = document.getElementById('export-btn');
const shareBtn = document.getElementById('share-btn');
const newRoastBtn = document.getElementById('new-roast-btn');

const errorMessage = document.getElementById('error-message');
const errorRetryBtn = document.getElementById('error-retry-btn');

const toast = document.getElementById('toast');

// === State ===
let selectedIntensity = 'medium';
let selectedFile = null;
let currentResults = null;
let loadingInterval = null;

// === Loading Messages ===
const loadingMessages = [
  'Sharpening the red pen...',
  'Consulting 10,000 hiring managers...',
  'Calibrating savage-meter...',
  'Finding your weakest bullet points...',
  'Preparing constructive destruction...'
];

// === Word Count ===
function countWords(text) {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

function updateWordCount() {
  const text = resumeTextarea.value;
  const count = countWords(text);
  wordCountDisplay.textContent = count;

  const wcContainer = resumeTextarea.closest('.input-card').querySelector('.word-count');
  if (count >= 50) {
    wcContainer.classList.add('word-count--valid');
    wordCountHint.textContent = '';
  } else {
    wcContainer.classList.remove('word-count--valid');
    wordCountHint.textContent = '(minimum 50 words required)';
  }

  updateCTAState();
}

function updateCTAState() {
  const textCount = countWords(resumeTextarea.value);
  const hasFile = selectedFile !== null;
  // Enable if text has 50+ words OR a file is selected
  roastBtn.disabled = !(textCount >= 50 || hasFile);
}

resumeTextarea.addEventListener('input', updateWordCount);

// === File Upload ===
dropzone.addEventListener('click', (e) => {
  if (e.target === dropzoneClear || e.target.closest('.dropzone__clear')) return;
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFileSelect(file);
});

// Drag and drop
dropzone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropzone.classList.add('dropzone--dragover');
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dropzone--dragover');
});

dropzone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dropzone--dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dropzone--dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

function handleFileSelect(file) {
  const allowedTypes = ['.pdf', '.docx', '.txt'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();

  if (!allowedTypes.includes(ext)) {
    showToast('Only .pdf, .docx, and .txt files are accepted');
    return;
  }

  selectedFile = file;
  dropzoneContent.hidden = true;
  dropzoneFile.hidden = false;
  dropzoneFilename.textContent = file.name;
  updateCTAState();
}

dropzoneClear.addEventListener('click', (e) => {
  e.stopPropagation();
  clearFile();
});

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  dropzoneContent.hidden = false;
  dropzoneFile.hidden = true;
  dropzoneFilename.textContent = '';
  updateCTAState();
}

// === Intensity Toggle ===
const intensityBtns = document.querySelectorAll('.intensity-btn');
intensityBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    intensityBtns.forEach(b => b.classList.remove('intensity-btn--active'));
    btn.classList.add('intensity-btn--active');
    selectedIntensity = btn.dataset.intensity;
  });
});

// === Form Submission ===
roastBtn.addEventListener('click', submitRoast);

async function submitRoast() {
  const targetRole = targetRoleInput.value.trim();
  const text = resumeTextarea.value.trim();

  showLoading();

  try {
    let response;

    if (selectedFile) {
      // Multipart FormData for file upload
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('intensity', selectedIntensity);
      if (targetRole) formData.append('targetRole', targetRole);
      if (text) formData.append('text', text);

      response = await fetch('/api/roast', {
        method: 'POST',
        body: formData
      });
    } else {
      // JSON for text-only
      response = await fetch('/api/roast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          intensity: selectedIntensity,
          targetRole: targetRole || undefined
        })
      });
    }

    const data = await response.json();

    if (!response.ok) {
      handleApiError(response.status, data);
      return;
    }

    currentResults = data;
    showResults(data);
  } catch (err) {
    showError('Our roast machine choked. Check your connection and try again.');
  }
}

// === Loading State ===
function showLoading() {
  inputSection.hidden = true;
  loadingSection.hidden = false;
  resultsSection.hidden = true;
  errorSection.hidden = true;

  let msgIndex = 0;
  loadingMessage.textContent = loadingMessages[0];

  loadingInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % loadingMessages.length;
    loadingMessage.textContent = loadingMessages[msgIndex];
  }, 2500);
}

function hideLoading() {
  loadingSection.hidden = true;
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
}

// === Error Handling ===
function handleApiError(status, data) {
  let message;

  switch (status) {
    case 429:
      message = 'Whoa, slow down! Too many roasts. Try again in a minute.';
      break;
    case 503:
      message = 'API key not configured. Check the server setup.';
      break;
    case 400:
      message = data.error || 'Invalid input. Please check your resume and try again.';
      break;
    default:
      message = data.error || 'Something went wrong. Give it another shot.';
  }

  showError(message);
}

function showError(message) {
  hideLoading();
  inputSection.hidden = true;
  resultsSection.hidden = true;
  errorSection.hidden = false;
  errorMessage.textContent = message;
}

errorRetryBtn.addEventListener('click', resetToInput);

// === Results Rendering ===
function showResults(data) {
  hideLoading();
  inputSection.hidden = true;
  resultsSection.hidden = false;
  errorSection.hidden = true;

  // Animated score count-up
  animateScore(data.overallScore || 0);

  // Headline
  resultHeadline.textContent = data.headline || '';
  resultHeadline.classList.add('fade-in');

  // Top Fixes
  topFixesList.innerHTML = '';
  if (data.topFixes && data.topFixes.length > 0) {
    data.topFixes.forEach(fix => {
      const li = document.createElement('li');
      li.textContent = fix;
      topFixesList.appendChild(li);
    });
  }

  // Sections
  sectionsContainer.innerHTML = '';
  if (data.sections && data.sections.length > 0) {
    data.sections.forEach((section, index) => {
      const panel = createSectionPanel(section, index);
      sectionsContainer.appendChild(panel);
    });
  }

  // Strengths
  strengthsList.innerHTML = '';
  if (data.strengths && data.strengths.length > 0) {
    strengthsPanel.hidden = false;
    data.strengths.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      strengthsList.appendChild(li);
    });
  } else {
    strengthsPanel.hidden = true;
  }

  // ATS Flags
  atsList.innerHTML = '';
  if (data.atsFlags && data.atsFlags.length > 0) {
    atsPanel.hidden = false;
    data.atsFlags.forEach(flag => {
      const li = document.createElement('li');
      li.textContent = flag;
      atsList.appendChild(li);
    });
  } else {
    atsPanel.hidden = true;
  }
}

function animateScore(targetScore) {
  const duration = 2000;
  const startTime = performance.now();

  function tick(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out curve
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentScore = Math.round(easedProgress * targetScore);
    scoreValue.textContent = currentScore;

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

function createSectionPanel(section, index) {
  const panel = document.createElement('div');
  panel.className = 'section-panel';
  panel.style.animationDelay = `${index * 200}ms`;

  const header = document.createElement('button');
  header.className = 'section-panel__header';
  header.innerHTML = `
    <span>${escapeHtml(section.section)}</span>
    <span class="section-panel__chevron">&#9660;</span>
  `;

  const body = document.createElement('div');
  body.className = 'section-panel__body';

  const content = document.createElement('div');
  content.className = 'section-panel__content';

  if (section.issues && section.issues.length > 0) {
    section.issues.forEach(issue => {
      content.appendChild(createIssueCard(issue));
    });
  }

  body.appendChild(content);
  panel.appendChild(header);
  panel.appendChild(body);

  // Toggle expand/collapse
  header.addEventListener('click', () => {
    panel.classList.toggle('section-panel--open');
  });

  // Auto-expand first section
  if (index === 0) {
    panel.classList.add('section-panel--open');
  }

  return panel;
}

function createIssueCard(issue) {
  const card = document.createElement('div');
  card.className = 'issue-card';

  // Quote
  if (issue.quote) {
    const quote = document.createElement('div');
    quote.className = 'issue-card__quote';
    quote.textContent = issue.quote;
    card.appendChild(quote);
  }

  // Roast
  if (issue.roast) {
    const roast = document.createElement('div');
    roast.className = 'issue-card__roast';
    roast.textContent = issue.roast;
    card.appendChild(roast);
  }

  // Why
  if (issue.why) {
    const why = document.createElement('div');
    why.className = 'issue-card__why';
    why.textContent = issue.why;
    card.appendChild(why);
  }

  // Fix
  if (issue.fix) {
    const fix = document.createElement('div');
    fix.className = 'issue-card__fix';
    fix.textContent = issue.fix;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => copyToClipboard(issue.fix, copyBtn));
    fix.appendChild(copyBtn);

    card.appendChild(fix);
  }

  return card;
}

// === Copy to Clipboard ===
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.color = 'var(--accent-success)';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.color = '';
    }, 2000);
  } catch {
    showToast('Could not copy to clipboard');
  }
}

// === Export as Markdown ===
exportBtn.addEventListener('click', () => {
  if (!currentResults) return;

  const md = generateMarkdown(currentResults);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resume-roast-report.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Report downloaded!');
});

function generateMarkdown(data) {
  let md = `# Resume Roast Report\n\n`;
  md += `**Score:** ${data.overallScore}/100\n\n`;
  md += `**Headline:** ${data.headline}\n\n`;

  if (data.topFixes && data.topFixes.length > 0) {
    md += `## Top Fixes\n\n`;
    data.topFixes.forEach((fix, i) => {
      md += `${i + 1}. ${fix}\n`;
    });
    md += `\n`;
  }

  if (data.sections && data.sections.length > 0) {
    data.sections.forEach(section => {
      md += `## ${section.section}\n\n`;
      if (section.issues && section.issues.length > 0) {
        section.issues.forEach(issue => {
          if (issue.quote) md += `> "${issue.quote}"\n\n`;
          if (issue.roast) md += `**Roast:** ${issue.roast}\n\n`;
          if (issue.why) md += `*Why:* ${issue.why}\n\n`;
          if (issue.fix) md += `**Fix:** ${issue.fix}\n\n`;
          md += `---\n\n`;
        });
      }
    });
  }

  if (data.strengths && data.strengths.length > 0) {
    md += `## Strengths\n\n`;
    data.strengths.forEach(s => {
      md += `- ${s}\n`;
    });
    md += `\n`;
  }

  if (data.atsFlags && data.atsFlags.length > 0) {
    md += `## ATS Flags\n\n`;
    data.atsFlags.forEach(flag => {
      md += `- ${flag}\n`;
    });
    md += `\n`;
  }

  return md;
}

// === Share Roast Card ===
shareBtn.addEventListener('click', async () => {
  if (!currentResults) return;

  const data = currentResults;
  let shareText = `Resume Roast Score: ${data.overallScore}/100\n`;
  shareText += `"${data.headline}"\n\n`;

  if (data.topFixes && data.topFixes.length > 0) {
    shareText += `Top Fixes:\n`;
    data.topFixes.forEach((fix, i) => {
      shareText += `${i + 1}. ${fix}\n`;
    });
  }

  shareText += `\n-- Roasted by Resume Roaster`;

  try {
    await navigator.clipboard.writeText(shareText);
    showToast('Copied to clipboard! Share it!');
  } catch {
    showToast('Could not copy to clipboard');
  }
});

// === New Roast / Reset ===
newRoastBtn.addEventListener('click', resetToInput);

function resetToInput() {
  inputSection.hidden = false;
  loadingSection.hidden = true;
  resultsSection.hidden = true;
  errorSection.hidden = true;
  currentResults = null;
}

// === Toast ===
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  // Force reflow
  toast.offsetHeight;
  toast.classList.add('toast--visible');

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => {
      toast.hidden = true;
    }, 300);
  }, 2500);
}

// === Utility ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// === Initialize ===
updateWordCount();
