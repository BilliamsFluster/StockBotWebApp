import { ComponentType } from 'react';

declare module 'open-webui' {
  interface OpenWebUIProps {
    apiUrl?: string;
    authToken?: string;
  }
  const OpenWebUI: ComponentType<OpenWebUIProps>;
  export default OpenWebUI;
}

