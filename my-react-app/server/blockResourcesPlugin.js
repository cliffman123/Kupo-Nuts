/**
 * Custom Puppeteer plugin to block specified resource types
 */
const createBlockResourcesPlugin = (resourceTypes = ['image', 'stylesheet', 'font']) => {
  return {
    name: 'block-resources',
    
    async onPageCreated(page) {
      await page.setRequestInterception(true);
      
      page.on('request', (request) => {
        if (resourceTypes.includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      console.log(`BlockResourcesPlugin: Blocking resource types: ${resourceTypes.join(', ')}`);
    }
  };
};

module.exports = { createBlockResourcesPlugin };
