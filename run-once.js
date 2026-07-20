const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const CACHE_FILE = path.join(__dirname, 'cache.json');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let cachedGrades = [];

function log(msg) {
  const now = new Date();
  console.log(`[${now.toLocaleString('zh-CN')}] ${msg}`);
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      cachedGrades = JSON.parse(data);
      log(`已加载缓存，共 ${cachedGrades.length} 门科目`);
    } else {
      log('未找到缓存文件');
    }
  } catch (error) {
    log(`加载缓存失败: ${error.message}`);
    cachedGrades = [];
  }
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cachedGrades, null, 2));
    log('缓存已保存');
  } catch (error) {
    log(`保存缓存失败: ${error.message}`);
  }
}

async function getGrades() {
  let browser;
  try {
    log('正在尝试登录...');
    
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    
    await page.goto('https://newjw.cau.edu.cn/jsxsd/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    
    await page.type('input[name="userAccount"]', config.username, { delay: Math.random() * 50 + 50 });
    await page.type('input[name="userPassword"]', config.password, { delay: Math.random() * 50 + 50 });
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    
    const loginButton = await page.$('button');
    if (loginButton) {
      await loginButton.click();
    } else {
      await page.keyboard.press('Enter');
    }
    
    let loginSuccess = false;
    try {
      await page.waitForNavigation({
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      loginSuccess = true;
    } catch (e) {
      log('登录导航超时，检查页面状态');
      const currentUrl = page.url();
      if (currentUrl.includes('xsMain') || currentUrl.includes('framework')) {
        loginSuccess = true;
      }
    }
    
    if (!loginSuccess) {
      const currentUrl = page.url();
      if (!currentUrl.includes('xsMain') && !currentUrl.includes('framework')) {
        if (browser) await browser.close();
        throw new Error('登录失败');
      }
    }
    
    await page.goto('https://newjw.cau.edu.cn/jsxsd/kscj/cjcx_list', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await page.evaluate(() => {
      const selectXnd = document.querySelector('select[name="xnd"]');
      const selectXqd = document.querySelector('select[name="xqd"]');
      
      if (selectXnd) {
        selectXnd.value = '2025-2026';
      }
      if (selectXqd) {
        selectXqd.value = '3';
      }
      
      const queryBtn = document.querySelector('input[type="button"]');
      if (queryBtn) {
        queryBtn.click();
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const grades = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        if (rows.length > 1) {
          const headerRow = rows[0];
          const headers = headerRow.querySelectorAll('th, td');
          let courseNameIndex = -1;
          let gradeIndex = -1;
          
          headers.forEach((header, index) => {
            const text = header.textContent.trim();
            if (text.includes('课程名称') || text.includes('课程名')) {
              courseNameIndex = index;
            }
            if (text.includes('成绩') && !text.includes('绩点')) {
              gradeIndex = index;
            }
          });
          
          if (courseNameIndex === -1) {
            headers.forEach((header, index) => {
              const text = header.textContent.trim();
              if (text.includes('课程')) {
                courseNameIndex = index;
              }
            });
          }
          
          if (courseNameIndex !== -1) {
            const results = [];
            for (let i = 1; i < rows.length; i++) {
              const cells = rows[i].querySelectorAll('td');
              if (cells.length > courseNameIndex) {
                const courseName = cells[courseNameIndex].textContent.trim();
                if (courseName && courseName.length > 2) {
                  const grade = gradeIndex >= 0 && cells.length > gradeIndex 
                    ? cells[gradeIndex].textContent.trim() 
                    : (cells.length > 6 ? cells[6].textContent.trim() : '');
                  results.push({
                    courseName: courseName,
                    grade: grade
                  });
                }
              }
            }
            if (results.length > 0) {
              return results;
            }
          }
        }
      }
      
      return [];
    });
    
    await browser.close();
    
    if (grades.length === 0) {
      throw new Error('未查询到成绩');
    }
    
    log(`查询到 ${grades.length} 门科目成绩`);
    return grades;
    
  } catch (error) {
    log(`获取成绩异常: ${error.message}`);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

function compareGrades(newGrades) {
  const changes = {
    newCourses: [],
    targetCourseChanged: false,
    targetCourseOldGrade: null,
    targetCourseNewGrade: null,
    targetCourseCurrentGrade: null
  };
  
  const newCourseNames = newGrades.map(g => g.courseName);
  const oldCourseNames = cachedGrades.map(g => g.courseName);
  
  for (const grade of newGrades) {
    if (!oldCourseNames.includes(grade.courseName)) {
      changes.newCourses.push(grade);
    }
    
    if (grade.courseName === config.targetCourse) {
      changes.targetCourseCurrentGrade = grade.grade;
      const oldGrade = cachedGrades.find(g => g.courseName === config.targetCourse);
      if (oldGrade) {
        if (oldGrade.grade !== grade.grade) {
          changes.targetCourseChanged = true;
          changes.targetCourseOldGrade = oldGrade.grade;
          changes.targetCourseNewGrade = grade.grade;
        }
      }
    }
  }
  
  cachedGrades = JSON.parse(JSON.stringify(newGrades));
  saveCache();
  
  return changes;
}

async function sendDingTalk(message) {
  if (!config.dingTalkToken) return;
  
  try {
    await axios.post(`https://oapi.dingtalk.com/robot/send?access_token=${config.dingTalkToken}`, {
      msgtype: 'text',
      text: {
        content: `成绩更新提醒\n${message}`
      }
    });
    log('钉钉推送成功');
  } catch (error) {
    log(`钉钉推送失败: ${error.message}`);
    throw error;
  }
}

async function sendNotification(changes) {
  let message = '';
  
  if (changes.targetCourseChanged) {
    message += `【离散数学II】${changes.targetCourseOldGrade} → ${changes.targetCourseNewGrade} 🎉\n`;
  }
  
  if (changes.newCourses.length > 0) {
    message += `【新增科目】\n`;
    changes.newCourses.forEach(course => {
      message += `• ${course.courseName}: ${course.grade}\n`;
    });
  }
  
  if (message) {
    log(`发送通知: ${message}`);
    await sendDingTalk(message);
    return true;
  }
  return false;
}

async function main() {
  if (!config.username || !config.password) {
    log('请配置用户名和密码环境变量');
    process.exit(1);
  }
  
  loadCache();
  
  try {
    const grades = await getGrades();
    const changes = compareGrades(grades);
    
    if (changes.newCourses.length > 0) {
      log(`发现 ${changes.newCourses.length} 门新增科目`);
    }
    
    if (changes.targetCourseChanged) {
      log(`${config.targetCourse} 成绩更新!`);
    }
    
    if (cachedGrades.length > 0) {
      const hasNotification = await sendNotification(changes);
      if (!hasNotification) {
        log('无成绩变化，跳过推送');
      }
    } else {
      log('首次运行，缓存已保存');
    }
    
    process.exit(0);
  } catch (error) {
    log(`执行失败: ${error.message}`);
    process.exit(1);
  }
}

main();