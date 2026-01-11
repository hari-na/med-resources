document.addEventListener('DOMContentLoaded', () => {
    // --- Dark Mode ---
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const body = document.body;

    // Load dark mode preference
    if (localStorage.getItem('med-exam-dark-mode') === 'enabled') {
        body.classList.add('dark-mode');
    }

    darkModeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('med-exam-dark-mode', 'enabled');
        } else {
            localStorage.setItem('med-exam-dark-mode', 'disabled');
        }
    });

    // --- Case Mastery Tracker ---
    const subjectCards = document.querySelectorAll('.subject-card');

    // Load progress from localStorage
    const savedProgress = JSON.parse(localStorage.getItem('med-exam-mastery')) || {};

    subjectCards.forEach(card => {
        const subject = card.dataset.subject;
        const checkboxes = card.querySelectorAll('input[type="checkbox"]');
        const progressBar = card.querySelector('.progress-bar');
        const progressText = card.querySelector('.progress-text');

        // Restore checked state
        checkboxes.forEach(checkbox => {
            if (savedProgress[checkbox.id]) {
                checkbox.checked = true;
                checkbox.closest('.topic-item').classList.add('mastered');
            }

            // Add listener for changes
            checkbox.addEventListener('change', () => {
                const item = checkbox.closest('.topic-item');
                if (checkbox.checked) {
                    item.classList.add('mastered');
                    savedProgress[checkbox.id] = true;
                } else {
                    item.classList.remove('mastered');
                    delete savedProgress[checkbox.id];
                }

                // Save to localStorage
                localStorage.setItem('med-exam-mastery', JSON.stringify(savedProgress));

                // Update progress bar
                updateSubjectProgress(card);
            });
        });

        // Initial progress update
        updateSubjectProgress(card);
    });

    function updateSubjectProgress(card) {
        const checkboxes = card.querySelectorAll('input[type="checkbox"]');
        const progressBar = card.querySelector('.progress-bar');
        const progressText = card.querySelector('.progress-text');

        if (!checkboxes.length || !progressBar) return;

        const total = checkboxes.length;
        const mastered = Array.from(checkboxes).filter(cb => cb.checked).length;
        const percent = Math.round((mastered / total) * 100);

        progressBar.style.setProperty('--progress', `${percent}%`);
        progressText.textContent = `${mastered}/${total} Mastered`;
    }

    // --- Accordion functionality ---
    const subjectHeaders = document.querySelectorAll('.subject-header');

    subjectHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking on progress bar or label (though they are inside, just to be safe)
            if (e.target.closest('.progress-container')) return;

            const card = header.closest('.subject-card');
            const content = card.querySelector('.subject-content');
            const icon = header.querySelector('.toggle-icon');

            content.classList.toggle('active');
            icon.classList.toggle('rotated');
        });
    });

    // --- Search functionality ---
    const searchInput = document.getElementById('search-input');
    const topics = document.querySelectorAll('.topic-item');

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();

        topics.forEach(topic => {
            const label = topic.querySelector('label');
            const text = label ? label.textContent.toLowerCase() : topic.textContent.toLowerCase();
            const card = topic.closest('.subject-card');
            const content = card.querySelector('.subject-content');

            if (searchTerm) {
                if (text.includes(searchTerm)) {
                    topic.style.display = 'flex';
                    content.classList.add('active');
                    const icon = card.querySelector('.toggle-icon');
                    if (icon) icon.classList.add('rotated');
                } else {
                    topic.style.display = 'none';
                }
            } else {
                topic.style.display = 'flex';
            }
        });
    });
});
