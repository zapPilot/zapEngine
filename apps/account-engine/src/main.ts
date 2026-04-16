import 'dotenv/config';

import { bootstrap } from './app';

export { bootstrap };

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
