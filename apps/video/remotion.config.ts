// Studio and CLI renders read this file; scripts/render.ts and
// scripts/contact-sheet.ts pass the same settings to @remotion/renderer
// explicitly because the Node APIs ignore it.
import { Config } from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setOverwriteOutput(true);
