document.addEventListener('DOMContentLoaded', () => {
    // Accordion functionality
    const subjectHeaders = document.querySelectorAll('.subject-header');

    subjectHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const icon = header.querySelector('.toggle-icon');

            content.classList.toggle('active');
            icon.classList.toggle('rotated');
        });
    });

    // Search functionality
    const searchInput = document.getElementById('search-input');
    const topics = document.querySelectorAll('.topic-item');

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();

        topics.forEach(topic => {
            const text = topic.textContent.toLowerCase();
            const parentSection = topic.closest('.subject-content');
            
            // If we have a search term
            if (searchTerm) {
                // Determine visibility based on match
                if (text.includes(searchTerm)) {
                    topic.style.display = 'flex';
                    // Auto-expand the parent section if a match is found
                    if(parentSection) {
                         parentSection.classList.add('active');
                         // Also rotate the icon if needed
                         const header = parentSection.previousElementSibling;
                         if(header) {
                             const icon = header.querySelector('.toggle-icon');
                             if(icon) icon.classList.add('rotated');
                         }
                    }
                } else {
                    topic.style.display = 'none';
                }
            } else {
                // If search is empty, reset everything
                topic.style.display = 'flex';
                // Optional: collapse all sections or leave as is. 
                // Let's leave them as they were or collapse them to clean up.
                // For better UX, let's not auto-collapse on clear, just reset item visibility.
            }
        });
    });
});
