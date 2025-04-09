const { PuppeteerExtraPlugin } = require('puppeteer-extra-plugin')

/**
 * Plugin to block specific resource types in Puppeteer
 */
class BlockResourcesPlugin extends PuppeteerExtraPlugin {
  constructor(opts = {}) {
    super(opts)
    this.resourceTypes = opts.resourceTypes || ['font', 'media']
  }

  get name() {
    return 'block-resources'
  }

  async onPageCreated(page) {
    await page.setRequestInterception(true)
    page.on('request', request => {
      const resourceType = request.resourceType()
      if (this.resourceTypes.includes(resourceType)) {
        request.abort()
      } else {
        request.continue()
      }
    })
  }
}

/**
 * Create a new instance of the plugin
 * @param {Array} resourceTypes - Array of resource types to block
 */
const createBlockResourcesPlugin = (resourceTypes = ['font', 'media']) => {
  return new BlockResourcesPlugin({ resourceTypes })
}

module.exports = { createBlockResourcesPlugin }
