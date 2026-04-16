
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'alpha_raw' }
});

async function test() {
  const { data, error } = await supabase
    .from('etl_job_queue')
    .select('count')
    .limit(1);
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! Data:', data);
  }
}

test();
