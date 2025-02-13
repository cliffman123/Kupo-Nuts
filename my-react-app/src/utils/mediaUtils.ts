export const shuffleArray = <T>(array: T[]): T[] => {
    array.reverse();
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    array.reverse();
    return array;
};

export const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error('Image failed to load:', e);
    e.currentTarget.style.display = 'none';
};

export const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    console.error('Video failed to load:', e);
    if (e.currentTarget.error?.code === 4) {
        e.currentTarget.style.display = 'none';
    }
};
