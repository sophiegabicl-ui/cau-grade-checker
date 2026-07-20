module.exports = {
  username: process.env.CAU_USERNAME || '2024308250132',
  password: process.env.CAU_PASSWORD || '',
  springSession: process.env.CAU_SESSION || '2025-2026学年春季',
  targetCourse: process.env.CAU_TARGET_COURSE || '离散数学II',
  targetChangeFrom: process.env.CAU_TARGET_FROM || 'B',
  targetChangeTo: process.env.CAU_TARGET_TO || 'A-',
  pushPlusToken: process.env.PUSH_PLUS_TOKEN || '',
  dingTalkToken: process.env.DING_TALK_TOKEN || '',
  barkUrl: process.env.BARK_URL || '',
  dayStartHour: parseInt(process.env.DAY_START_HOUR) || 6,
  dayEndHour: parseInt(process.env.DAY_END_HOUR) || 22,
  dayIntervalMinutes: parseInt(process.env.DAY_INTERVAL) || 60,
  nightIntervalMinutes: parseInt(process.env.NIGHT_INTERVAL) || 240
};