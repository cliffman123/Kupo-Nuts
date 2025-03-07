const { scrapeVideos } = require('./scraper');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Please enter a URL: ', (url) => {
    scrapeVideos(url)
        .then(existingLinks => {
            console.log('Scraping completed. Media links:', existingLinks);
        })
        .catch(error => {
            console.error('Error running scraper:', error);
        })
        .finally(() => {
            rl.close();
        });
});
