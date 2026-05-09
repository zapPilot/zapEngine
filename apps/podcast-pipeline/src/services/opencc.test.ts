import { describe, expect, it } from 'vitest';

import { convertArticleToZhTW, convertTextToZhTW } from './opencc.js';

describe('convertTextToZhTW', () => {
  it('converts Simplified Chinese words to Taiwan Traditional Chinese phrases', () => {
    expect(convertTextToZhTW('软件 鼠标 自行车')).toBe('軟體 滑鼠 腳踏車');
  });
});

describe('convertArticleToZhTW', () => {
  it('converts both article title and text', () => {
    expect(
      convertArticleToZhTW({
        title: '软件更新',
        text: '鼠标和自行车市场',
      }),
    ).toEqual({
      title: '軟體更新',
      text: '滑鼠和腳踏車市場',
    });
  });
});
