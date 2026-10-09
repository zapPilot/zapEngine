/// <reference types="nativewind/types" />

declare module '*.ttf' {
  const uri: string;
  export default uri;
}

// Side-effect stylesheet for the web runtime-model stage; Metro bundles it on web.
declare module '@zapengine/zap-pilot-story/engine.css';
