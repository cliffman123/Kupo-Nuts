export const lazyLoadMedia = (node) => {
    if (node) {
        if (node.tagName === 'VIDEO') {
            node.src = node.dataset.src; // Set the src to load the video
            node.load(); // Load the video
            node.muted = true; // Ensure it's muted
            node.play().catch(() => {});
        } else if (node.tagName === 'IMG') {
            node.src = node.dataset.src;
        }
    }
};
