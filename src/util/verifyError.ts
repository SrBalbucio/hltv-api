import { Page } from 'puppeteer';

import { HLTVError } from '../error/HLTVError';

export async function verifyError(page: Page) {
  const error = await page.evaluate(() => {
    const errorElement = document.querySelector('.error-status');

    if (!errorElement) {
      return null;
    }

    const status = Number(errorElement.querySelector('h1')?.textContent || 0) || 500;
    const message = errorElement.querySelector('.error-desc')?.textContent?.trim() || 'HLTV error page';

    return { status, message };
  });

  if (error) {
    throw new HLTVError(error.status, error.message, 'UPSTREAM_HLTV_ERROR');
  }
}
