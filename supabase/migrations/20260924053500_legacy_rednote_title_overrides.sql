alter table from_fed_to_chain.social_publish_jobs
  add column if not exists legacy_title_override text;

comment on column from_fed_to_chain.social_publish_jobs.legacy_title_override is
  'One-time migration escape hatch for Rednote jobs queued before canonical cross-platform titles. New jobs must leave this null.';

alter table from_fed_to_chain.social_publish_jobs
  drop constraint if exists social_publish_jobs_legacy_title_override_check;

alter table from_fed_to_chain.social_publish_jobs
  add constraint social_publish_jobs_legacy_title_override_check
  check (
    legacy_title_override is null
    or (
      platform = 'rednote'
      and language_code = 'zh-Hant'
      and legacy_title_override = btrim(legacy_title_override)
      and char_length(legacy_title_override) between 1 and 20
    )
  );

update from_fed_to_chain.social_publish_jobs
set legacy_title_override = case id
  when '08d5dbc3-c804-45b2-bdf6-2d1d5c89bfae'::uuid then 'Polymarket退幕後，預測市場去哪'
  when 'f1912dd6-52b7-4c0d-b01d-403aed656c4e'::uuid then 'Uniswap改革：DUNI怎麼運作？'
  when '48274da9-c7c3-4151-9f5a-7c853afe7b73'::uuid then '燧原投資：長桌、PPT與漫長中場'
  when 'a907954f-e006-4f21-aaa7-0b4c3d3e716e'::uuid then 'KiiChain鏈上外匯：快了，夠深嗎？'
  when 'b69c3ffd-62db-4d40-8ab4-17493f305352'::uuid then 'MoonPay把加密錢包塞進AI對話'
  when '4f3d8437-cd30-489e-87cc-ffcaed07f943'::uuid then 'AI反蒸餾：封帳號也防不住？'
  when '0d6c7c43-ccbf-4b0c-aa26-2847d14665bf'::uuid then '臥底東南亞黑灰產：人口到洗錢一條龍'
  when 'b2d7e6b8-1a00-49f2-853a-9fd2bbd40ca5'::uuid then '美國搶銅、智利限供，銅價爆了'
  when '841f929e-54a5-4b56-8a4c-1f7ef4bf2abf'::uuid then 'Agility：3億訂單只賺178萬？'
  when '82af7072-d4e4-4f84-8b0c-1a824211c3c3'::uuid then 'AI燒錢太狠，中國大廠開始找錢'
  when 'fa27dafa-0a1c-41b0-beed-e781e5e9476d'::uuid then '27歲Anthropic研究員為何辭職？'
  when '528b75c2-0974-4048-8946-c8783b6a9bae'::uuid then 'Pantera：算力正變成硬通貨'
  when 'cf280e33-7307-4470-8928-19ee4f3a6923'::uuid then 'Hayes：等危機放水，重倉以太坊'
  when '2aa484cc-042b-45ab-a3aa-77857b61229a'::uuid then 'Balancer清盤，DeFi退出範本'
  when 'eaba8aa7-f6a8-4155-a201-1c8fa2fe7fb0'::uuid then '0x質疑：過半v4 Hook是惡意的？'
  when '08aab546-aa4c-4202-a19c-e024a2ac9072'::uuid then '以太坊質押為何要先排隊一個月？'
  when '687c2ccb-59f1-4a2a-aa79-90b98ccb4f86'::uuid then 'Anthropic末日敘事是誰推的？'
  when '8dc74517-1c9b-423e-a9c2-b91ed77a3b3e'::uuid then 'Ethena Pay：入賬就賺收益？'
  when '8d6ddc6e-1dc1-46bf-8767-4c6046f85fb3'::uuid then '加密市場的教訓，AI投資者該重讀'
  when '33477839-05a7-4512-875b-32ac73c29df2'::uuid then '以太坊下次升級，會是最大催化劑？'
  when '5ff6dc5e-16b4-44b3-9254-75de534ace66'::uuid then 'ZCode偷傳程式碼，誰來審計？'
  when 'f2361749-4494-495c-96bd-111e464360ee'::uuid then 'TapeOut生態：NAND到鏈上應用'
  when 'c0561e53-49ba-4934-b72c-0e9cc98c7a66'::uuid then '果蠅大腦開源後，竟會玩遊戲炒幣'
  when '53025369-caf4-4bb2-9fa9-9111eb0f10ce'::uuid then 'a16z：金融機構上鍊的新思路'
  when '1fe27bf0-b232-46ab-b222-d309cf135658'::uuid then 'Coinbase聯創跑去掘金委內瑞拉油田'
  when '7a554484-f181-4757-8aeb-307c38f536ea'::uuid then 'Visa的25億美元鏈上生意怎麼做？'
end
where id in (
  '08d5dbc3-c804-45b2-bdf6-2d1d5c89bfae'::uuid,
  'f1912dd6-52b7-4c0d-b01d-403aed656c4e'::uuid,
  '48274da9-c7c3-4151-9f5a-7c853afe7b73'::uuid,
  'a907954f-e006-4f21-aaa7-0b4c3d3e716e'::uuid,
  'b69c3ffd-62db-4d40-8ab4-17493f305352'::uuid,
  '4f3d8437-cd30-489e-87cc-ffcaed07f943'::uuid,
  '0d6c7c43-ccbf-4b0c-aa26-2847d14665bf'::uuid,
  'b2d7e6b8-1a00-49f2-853a-9fd2bbd40ca5'::uuid,
  '841f929e-54a5-4b56-8a4c-1f7ef4bf2abf'::uuid,
  '82af7072-d4e4-4f84-8b0c-1a824211c3c3'::uuid,
  'fa27dafa-0a1c-41b0-beed-e781e5e9476d'::uuid,
  '528b75c2-0974-4048-8946-c8783b6a9bae'::uuid,
  'cf280e33-7307-4470-8928-19ee4f3a6923'::uuid,
  '2aa484cc-042b-45ab-a3aa-77857b61229a'::uuid,
  'eaba8aa7-f6a8-4155-a201-1c8fa2fe7fb0'::uuid,
  '08aab546-aa4c-4202-a19c-e024a2ac9072'::uuid,
  '687c2ccb-59f1-4a2a-aa79-90b98ccb4f86'::uuid,
  '8dc74517-1c9b-423e-a9c2-b91ed77a3b3e'::uuid,
  '8d6ddc6e-1dc1-46bf-8767-4c6046f85fb3'::uuid,
  '33477839-05a7-4512-875b-32ac73c29df2'::uuid,
  '5ff6dc5e-16b4-44b3-9254-75de534ace66'::uuid,
  'f2361749-4494-495c-96bd-111e464360ee'::uuid,
  'c0561e53-49ba-4934-b72c-0e9cc98c7a66'::uuid,
  '53025369-caf4-4bb2-9fa9-9111eb0f10ce'::uuid,
  '1fe27bf0-b232-46ab-b222-d309cf135658'::uuid,
  '7a554484-f181-4757-8aeb-307c38f536ea'::uuid
)
and platform = 'rednote'
and language_code = 'zh-Hant'
and status in ('queued', 'failed');
