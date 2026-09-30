import { describe, expect, it } from 'vitest';

import { convertTextToZhCN, convertTextToZhTW } from './opencc.js';

describe('Chinese character contracts', () => {
  it.each(['程序员', '影片', '什么', '显著', '硅基', '意味着'])(
    'preserves Simplified source vocabulary: %s',
    (text) => expect(convertTextToZhCN(text)).toBe(text),
  );

  it('changes Traditional character forms without Taiwan vocabulary rewrites', () => {
    expect(convertTextToZhCN('這個網路 什麼')).toBe('这个网路 什么');
  });

  it('still applies Taiwan vocabulary for Threads', () => {
    expect(convertTextToZhTW('网络 软件 鼠标 自行车')).toBe(
      '網路 軟體 滑鼠 腳踏車',
    );
  });
});
