// ==UserScript==
// @name         X/Twitter DeepSeek翻译器
// @namespace    https://github.com/comdotwww/X-Twitter-DeepSeek-Translator
// @version      1.4
// @description  使用DeepSeek API翻译推文
// @author       TXBB
// @match        https://twitter.com/*
// @match        https://x.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api.deepseek.com
// ==/UserScript==

(function() {
    'use strict';

    // 默认配置
    const DEFAULT_CONFIG = {
        ENCRYPTION_KEY: '', // 用户自定义加密密钥
        ENCRYPTED_API_KEY: '', // 加密后的API密钥
        PROMPT: `你是一个专业的翻译助手。请将以下推文翻译成中文，保持原文的风格和情感，同时确保翻译自然流畅。

翻译要求：
1. 准确传达原文意思
2. 保持推文的简洁性
3. 适当处理网络用语和表情符号
4. 如果是疑问句，保持疑问语气
5. 保留标签和@提及

请直接返回翻译结果，不要添加任何额外说明。`,
        AUTO_TRANSLATE: true,
        SHOW_LOADING: true,
        THEME: 'auto'
    };

    // 预置提示词模板
    const PRESET_PROMPTS = {
        standard: {
            name: "标准翻译",
            content: `你是一个专业的翻译助手。请将以下推文翻译成中文，保持原文的风格和情感，同时确保翻译自然流畅。

翻译要求：
1. 准确传达原文意思
2. 保持推文的简洁性
3. 适当处理网络用语和表情符号
4. 如果是疑问句，保持疑问语气
5. 保留标签和@提及

请直接返回翻译结果，不要添加任何额外说明。`
        },
        concise: {
            name: "简洁翻译",
            content: `请将以下推文简洁地翻译成中文，保持原意但更紧凑。直接返回翻译结果。`
        },
        formal: {
            name: "正式翻译",
            content: `请将以下推文正式地翻译成中文，使用规范的书面语。保持专业性和准确性。直接返回翻译结果。`
        },
        casual: {
            name: "口语化翻译",
            content: `请将以下推文用自然的口语化中文翻译，让读起来像日常对话。保留原文的情感色彩。直接返回翻译结果。`
        }
    };

    // 主题配置
    const THEMES = {
        light: {
            bgPrimary: '#ffffff',
            bgSecondary: '#f7f9fa',
            textPrimary: '#000000',
            textSecondary: '#536471',
            border: '#cfd9de',
            accent: '#1d9bf0',
            accentHover: '#1a8cd8',
            error: '#f91880',
            success: '#00ba7c'
        },
        dark: {
            bgPrimary: '#000000',
            bgSecondary: '#16181c',
            textPrimary: '#ffffff',
            textSecondary: '#71767b',
            border: '#2f3336',
            accent: '#1d9bf0',
            accentHover: '#1a8cd8',
            error: '#f91880',
            success: '#00ba7c'
        },
        dim: {
            bgPrimary: '#15202b',
            bgSecondary: '#1e2732',
            textPrimary: '#f7f9fa',
            textSecondary: '#8b98a5',
            border: '#38444d',
            accent: '#1d9bf0',
            accentHover: '#1a8cd8',
            error: '#f91880',
            success: '#00ba7c'
        }
    };

    // 加密工具类
    const CryptoUtils = {
        // 生成随机盐值
        generateSalt(length = 16) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        },

        // 派生密钥
        deriveKey(password, salt) {
            const encoder = new TextEncoder();
            const keyMaterial = encoder.encode(password + salt);
            
            // 简单的密钥派生函数（在实际应用中可以使用更复杂的方法）
            let key = '';
            for (let i = 0; i < keyMaterial.length; i++) {
                key += String.fromCharCode(keyMaterial[i] ^ (i * 7 + salt.length));
            }
            return key.slice(0, 32).padEnd(32, '0');
        },

        // 加密
        encrypt(text, password) {
            try {
                const salt = this.generateSalt();
                const key = this.deriveKey(password, salt);
                
                let result = '';
                for (let i = 0; i < text.length; i++) {
                    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
                    result += String.fromCharCode(charCode);
                }
                
                // 返回 salt + 加密数据
                return salt + btoa(result);
            } catch (error) {
                console.error('加密失败:', error);
                return null;
            }
        },

        // 解密
        decrypt(encryptedText, password) {
            try {
                if (!encryptedText || encryptedText.length < 16) {
                    return null;
                }
                
                const salt = encryptedText.substring(0, 16);
                const encryptedData = encryptedText.substring(16);
                
                const key = this.deriveKey(password, salt);
                const decodedData = atob(encryptedData);
                
                let result = '';
                for (let i = 0; i < decodedData.length; i++) {
                    const charCode = decodedData.charCodeAt(i) ^ key.charCodeAt(i % key.length);
                    result += String.fromCharCode(charCode);
                }
                
                return result;
            } catch (error) {
                console.error('解密失败:', error);
                return null;
            }
        },

        // 验证加密密钥格式
        validateEncryptionKey(key) {
            return key && key.length >= 8 && key.length <= 32;
        }
    };

    // 检测当前主题
    function detectTheme() {
        const html = document.documentElement;
        const themeAttr = html.getAttribute('data-theme');
        if (themeAttr) {
            return themeAttr;
        }

        const bodyStyle = window.getComputedStyle(document.body);
        const bgColor = bodyStyle.backgroundColor;
        
        if (bgColor.includes('rgb(21, 32, 43)') || bgColor.includes('#15202b')) {
            return 'dim';
        } else if (bgColor.includes('rgb(0, 0, 0)') || bgColor.includes('black')) {
            return 'dark';
        } else {
            return 'light';
        }
    }

    // 获取当前主题配置
    function getCurrentTheme() {
        const config = getConfig();
        let theme = config.THEME;
        
        if (theme === 'auto') {
            theme = detectTheme();
        }
        
        return THEMES[theme] || THEMES.light;
    }

    // 获取配置
    function getConfig() {
        const savedConfig = GM_getValue('deepseek_config');
        return { ...DEFAULT_CONFIG, ...savedConfig };
    }

    // 保存配置
    function saveConfig(config) {
        GM_setValue('deepseek_config', config);
    }

    // 获取解密后的API密钥
    function getDecryptedApiKey() {
        const config = getConfig();
        if (!config.ENCRYPTED_API_KEY || !config.ENCRYPTION_KEY) {
            return '';
        }
        
        const decrypted = CryptoUtils.decrypt(config.ENCRYPTED_API_KEY, config.ENCRYPTION_KEY);
        return decrypted || '';
    }

    // 加密并保存API密钥
    function encryptAndSaveApiKey(apiKey, encryptionKey) {
        if (!CryptoUtils.validateEncryptionKey(encryptionKey)) {
            throw new Error('加密密钥必须为8-32位字符');
        }
        
        const encrypted = CryptoUtils.encrypt(apiKey, encryptionKey);
        if (!encrypted) {
            throw new Error('加密失败');
        }
        
        const config = getConfig();
        config.ENCRYPTED_API_KEY = encrypted;
        config.ENCRYPTION_KEY = encryptionKey;
        saveConfig(config);
        
        return true;
    }

    // 获取已翻译的推文ID集合
    function getTranslatedTweets() {
        const stored = GM_getValue('translatedTweets', '{}');
        try {
            return new Set(JSON.parse(stored));
        } catch {
            return new Set();
        }
    }

    // 保存已翻译的推文ID
    function saveTranslatedTweet(tweetId) {
        const translatedTweets = getTranslatedTweets();
        translatedTweets.add(tweetId);
        GM_setValue('translatedTweets', JSON.stringify([...translatedTweets]));
    }

    // 检查推文是否已翻译
    function isTweetTranslated(tweetId) {
        const translatedTweets = getTranslatedTweets();
        return translatedTweets.has(tweetId);
    }

    // 检查是否已经存在翻译元素
    function hasTranslationElement(tweetElement) {
        return tweetElement.querySelector('.deepseek-translation') !== null;
    }

    // 显示配置界面
    function showConfigPanel() {
        const existingPanel = document.getElementById('deepseek-config-panel');
        if (existingPanel) {
            existingPanel.style.display = 'block';
            document.getElementById('deepseek-config-overlay').style.display = 'block';
            return;
        }

        const config = getConfig();
        const theme = getCurrentTheme();

        const overlay = document.createElement('div');
        overlay.id = 'deepseek-config-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 9999;
            backdrop-filter: blur(2px);
        `;
        overlay.onclick = () => {
            document.getElementById('deepseek-config-panel').remove();
            overlay.remove();
        };

        const panel = document.createElement('div');
        panel.id = 'deepseek-config-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${theme.bgPrimary};
            padding: 24px;
            border-radius: 16px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.4);
            z-index: 10000;
            min-width: 500px;
            max-width: 90vw;
            max-height: 85vh;
            overflow-y: auto;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            color: ${theme.textPrimary};
            border: 1px solid ${theme.border};
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid ${theme.border};
        `;

        const title = document.createElement('h3');
        title.textContent = 'DeepSeek翻译器配置';
        title.style.cssText = `
            margin: 0;
            color: ${theme.textPrimary};
            font-size: 20px;
            font-weight: 700;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: ${theme.textSecondary};
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.backgroundColor = theme.bgSecondary;
        closeBtn.onmouseout = () => closeBtn.style.backgroundColor = 'transparent';
        closeBtn.onclick = () => {
            panel.remove();
            overlay.remove();
        };

        header.appendChild(title);
        header.appendChild(closeBtn);

        // API密钥配置
        const apiKeySection = createConfigSection('API密钥配置', '请输入您的DeepSeek API密钥和加密密钥：', theme);
        
        const encryptionKeyInput = createTextInput('加密密钥（8-32位字符）', config.ENCRYPTION_KEY, true, theme);
        encryptionKeyInput.title = '请设置一个8-32位的加密密钥，用于保护您的API密钥';
        
        const apiKeyInput = createTextInput('DeepSeek API密钥', '', true, theme);
        apiKeyInput.placeholder = '输入新的API密钥（留空则保持现有密钥）';
        apiKeyInput.title = '输入新的API密钥，将使用上面的加密密钥进行加密存储';

        apiKeySection.appendChild(encryptionKeyInput);
        apiKeySection.appendChild(apiKeyInput);

        // 密钥状态显示
        const keyStatus = document.createElement('div');
        keyStatus.style.cssText = `
            font-size: 12px;
            color: ${theme.textSecondary};
            margin-top: 8px;
            padding: 8px;
            border-radius: 4px;
            background: ${theme.bgSecondary};
        `;
        
        const decryptedKey = getDecryptedApiKey();
        if (decryptedKey) {
            keyStatus.textContent = `✅ API密钥已加密存储（${decryptedKey.length > 4 ? decryptedKey.substring(0, 4) + '...' + decryptedKey.substring(decryptedKey.length - 4) : '已设置'}）`;
        } else {
            keyStatus.textContent = '❌ 未设置API密钥';
        }
        apiKeySection.appendChild(keyStatus);

        // 主题选择
        const themeSection = createConfigSection('界面主题', '选择配置面板的主题：', theme);
        const themeSelect = createSelect([
            { value: 'auto', label: '自动（跟随Twitter）' },
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
            { value: 'dim', label: '暗淡' }
        ], config.THEME, theme);
        themeSelect.onchange = () => {
            const newConfig = { ...config, THEME: themeSelect.value };
            saveConfig(newConfig);
            panel.remove();
            overlay.remove();
            setTimeout(showConfigPanel, 100);
        };
        themeSection.appendChild(themeSelect);

        // 提示词选择
        const promptSection = createConfigSection('翻译提示词', '选择或自定义翻译提示词：', theme);
        
        const presetSelect = createSelect([
            { value: 'custom', label: '自定义提示词' },
            ...Object.keys(PRESET_PROMPTS).map(key => ({
                value: key,
                label: PRESET_PROMPTS[key].name
            }))
        ], 'custom', theme);
        
        presetSelect.onchange = (e) => {
            if (e.target.value !== 'custom') {
                promptTextarea.value = PRESET_PROMPTS[e.target.value].content;
            }
        };

        const promptTextarea = document.createElement('textarea');
        promptTextarea.value = config.PROMPT;
        promptTextarea.style.cssText = `
            width: 100%;
            height: 180px;
            padding: 12px;
            background: ${theme.bgSecondary};
            color: ${theme.textPrimary};
            border: 1px solid ${theme.border};
            border-radius: 8px;
            resize: vertical;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 13px;
            line-height: 1.4;
            margin-top: 8px;
            box-sizing: border-box;
            transition: border-color 0.2s;
        `;
        promptTextarea.onfocus = () => promptTextarea.style.borderColor = theme.accent;
        promptTextarea.onblur = () => promptTextarea.style.borderColor = theme.border;

        promptSection.appendChild(presetSelect);
        promptSection.appendChild(promptTextarea);

        // 功能设置
        const featureSection = createConfigSection('功能设置', '', theme);
        
        const autoTranslateCheckbox = createCheckbox('自动翻译新推文', config.AUTO_TRANSLATE, theme);
        const showLoadingCheckbox = createCheckbox('显示翻译中提示', config.SHOW_LOADING, theme);
        
        featureSection.appendChild(autoTranslateCheckbox);
        featureSection.appendChild(showLoadingCheckbox);

        // 操作按钮
        const buttonSection = document.createElement('div');
        buttonSection.style.cssText = `
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid ${theme.border};
        `;

        const testBtn = createButton('测试连接', 'secondary', theme);
        testBtn.onclick = () => testConnection(encryptionKeyInput.value, apiKeyInput.value);

        const clearCacheBtn = createButton('清除缓存', 'secondary', theme);
        clearCacheBtn.onclick = () => {
            clearTranslationCache();
            showNotification('翻译缓存已清除', 'success', theme);
        };

        const saveBtn = createButton('保存配置', 'primary', theme);
        saveBtn.onclick = () => {
            try {
                const newConfig = {
                    PROMPT: promptTextarea.value,
                    AUTO_TRANSLATE: autoTranslateCheckbox.querySelector('input').checked,
                    SHOW_LOADING: showLoadingCheckbox.querySelector('input').checked,
                    THEME: themeSelect.value
                };

                // 处理API密钥加密
                if (apiKeyInput.value || encryptionKeyInput.value !== config.ENCRYPTION_KEY) {
                    if (!CryptoUtils.validateEncryptionKey(encryptionKeyInput.value)) {
                        throw new Error('加密密钥必须为8-32位字符');
                    }
                    
                    const apiKeyToSave = apiKeyInput.value || getDecryptedApiKey();
                    if (!apiKeyToSave) {
                        throw new Error('请输入API密钥');
                    }
                    
                    encryptAndSaveApiKey(apiKeyToSave, encryptionKeyInput.value);
                }

                // 保存其他配置
                newConfig.ENCRYPTION_KEY = encryptionKeyInput.value;
                saveConfig(newConfig);
                
                panel.remove();
                overlay.remove();
                showNotification('配置已保存！', 'success', theme);
            } catch (error) {
                showNotification('保存失败: ' + error.message, 'error', theme);
            }
        };

        const cancelBtn = createButton('取消', 'secondary', theme);
        cancelBtn.onclick = () => {
            panel.remove();
            overlay.remove();
        };

        buttonSection.appendChild(clearCacheBtn);
        buttonSection.appendChild(testBtn);
        buttonSection.appendChild(cancelBtn);
        buttonSection.appendChild(saveBtn);

        panel.appendChild(header);
        panel.appendChild(apiKeySection);
        panel.appendChild(themeSection);
        panel.appendChild(promptSection);
        panel.appendChild(featureSection);
        panel.appendChild(buttonSection);

        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        panel.onclick = (e) => e.stopPropagation();
    }

    // 创建配置区块
    function createConfigSection(title, description, theme) {
        const section = document.createElement('div');
        section.style.marginBottom = '24px';

        const titleEl = document.createElement('h4');
        titleEl.textContent = title;
        titleEl.style.cssText = `
            margin: 0 0 8px 0;
            color: ${theme.textPrimary};
            font-size: 16px;
            font-weight: 600;
        `;

        section.appendChild(titleEl);

        if (description) {
            const descEl = document.createElement('p');
            descEl.textContent = description;
            descEl.style.cssText = `
                margin: 0 0 12px 0; 
                color: ${theme.textSecondary}; 
                font-size: 14px;
                line-height: 1.4;
            `;
            section.appendChild(descEl);
        }

        return section;
    }

    // 创建文本输入框
    function createTextInput(placeholder, value, isPassword = false, theme) {
        const input = document.createElement('input');
        input.type = isPassword ? 'password' : 'text';
        input.placeholder = placeholder;
        input.value = value || '';
        input.style.cssText = `
            width: 100%;
            padding: 12px;
            background: ${theme.bgSecondary};
            color: ${theme.textPrimary};
            border: 1px solid ${theme.border};
            border-radius: 8px;
            box-sizing: border-box;
            font-size: 14px;
            transition: border-color 0.2s;
            margin-bottom: 12px;
        `;
        input.onfocus = () => input.style.borderColor = theme.accent;
        input.onblur = () => input.style.borderColor = theme.border;
        
        return input;
    }

    // 创建下拉选择框
    function createSelect(options, selectedValue, theme) {
        const select = document.createElement('select');
        select.style.cssText = `
            width: 100%;
            padding: 12px;
            background: ${theme.bgSecondary};
            color: ${theme.textPrimary};
            border: 1px solid ${theme.border};
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            transition: border-color 0.2s;
        `;
        select.onfocus = () => select.style.borderColor = theme.accent;
        select.onblur = () => select.style.borderColor = theme.border;

        options.forEach(option => {
            const optionEl = document.createElement('option');
            optionEl.value = option.value;
            optionEl.textContent = option.label;
            optionEl.selected = option.value === selectedValue;
            select.appendChild(optionEl);
        });

        return select;
    }

    // 创建复选框
    function createCheckbox(label, checked, theme) {
        const container = document.createElement('label');
        container.style.cssText = `
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            cursor: pointer;
            color: ${theme.textPrimary};
            font-size: 14px;
        `;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.style.cssText = `
            margin-right: 12px;
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: ${theme.accent};
        `;

        const labelText = document.createElement('span');
        labelText.textContent = label;

        container.appendChild(checkbox);
        container.appendChild(labelText);

        return container;
    }

    // 创建按钮
    function createButton(text, type, theme) {
        const button = document.createElement('button');
        button.textContent = text;
        button.type = 'button';
        
        const isPrimary = type === 'primary';
        button.style.cssText = `
            padding: 10px 20px;
            border: none;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            background: ${isPrimary ? theme.accent : 'transparent'};
            color: ${isPrimary ? '#ffffff' : theme.textPrimary};
            border: ${isPrimary ? 'none' : `1px solid ${theme.border}`};
        `;
        
        button.onmouseover = () => {
            button.style.background = isPrimary ? theme.accentHover : theme.bgSecondary;
        };
        button.onmouseout = () => {
            button.style.background = isPrimary ? theme.accent : 'transparent';
        };

        return button;
    }

    // 测试API连接
    function testConnection(encryptionKey, newApiKey) {
        try {
            let apiKeyToTest;
            
            if (newApiKey) {
                // 测试新输入的API密钥
                apiKeyToTest = newApiKey;
            } else {
                // 测试已保存的API密钥
                if (!encryptionKey) {
                    showNotification('请输入加密密钥', 'error');
                    return;
                }
                apiKeyToTest = CryptoUtils.decrypt(getConfig().ENCRYPTED_API_KEY, encryptionKey);
                if (!apiKeyToTest) {
                    showNotification('解密失败，请检查加密密钥', 'error');
                    return;
                }
            }

            if (!apiKeyToTest) {
                showNotification('请输入API密钥', 'error');
                return;
            }

            showNotification('测试连接中...', 'info');

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.deepseek.com/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKeyToTest}`
                },
                data: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: '请回复"连接成功"' }],
                    max_tokens: 10
                }),
                onload: function(response) {
                    if (response.status === 200) {
                        showNotification('API连接成功！', 'success');
                    } else {
                        showNotification(`连接失败: ${response.status}`, 'error');
                    }
                },
                onerror: function() {
                    showNotification('连接失败，请检查网络和API密钥', 'error');
                }
            });
        } catch (error) {
            showNotification('测试失败: ' + error.message, 'error');
        }
    }

    // 显示通知
    function showNotification(message, type = 'info', theme = null) {
        if (!theme) theme = getCurrentTheme();
        
        const notification = document.createElement('div');
        const bgColor = type === 'error' ? theme.error : type === 'success' ? theme.success : theme.accent;
        
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${bgColor};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10001;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // 清除翻译缓存
    function clearTranslationCache() {
        GM_setValue('translatedTweets', '{}');
        const keys = GM_listValues().filter(key => key.startsWith('translation_'));
        keys.forEach(key => GM_deleteValue(key));
    }

    // 添加配置按钮到页面
    function addConfigButton() {
        if (document.getElementById('deepseek-config-button')) return;
        
        const theme = getCurrentTheme();
        const button = document.createElement('button');
        button.id = 'deepseek-config-button';
        button.innerHTML = '🔧 DeepSeek';
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${theme.accent};
            color: white;
            border: none;
            border-radius: 20px;
            padding: 8px 16px;
            font-size: 12px;
            cursor: pointer;
            z-index: 9998;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            transition: background-color 0.2s;
        `;
        button.onmouseover = () => button.style.background = theme.accentHover;
        button.onmouseout = () => button.style.background = theme.accent;
        button.onclick = showConfigPanel;
        document.body.appendChild(button);
    }

    // 扫描页面中已存在的推文
    function scanExistingTweets() {
        const config = getConfig();
        if (!config.AUTO_TRANSLATE) return;

        const tweetSelectors = [
            'article[data-testid="tweet"]',
            'div[data-testid="tweet"]'
        ];

        tweetSelectors.forEach(selector => {
            const tweets = document.querySelectorAll(selector);
            tweets.forEach(tweet => {
                const tweetId = getTweetId(tweet);
                if (tweetId && isTweetTranslated(tweetId) && !hasTranslationElement(tweet)) {
                    restoreTranslation(tweet);
                } else if (tweetId && !isTweetTranslated(tweetId) && !hasTranslationElement(tweet)) {
                    translateTweet(tweet, tweetId);
                }
            });
        });
    }

    // 重新显示已翻译的内容
    function restoreTranslation(tweetElement) {
        const tweetId = getTweetId(tweetElement);
        const originalText = getTweetText(tweetElement);
        
        if (originalText) {
            const cachedTranslation = GM_getValue(`translation_${tweetId}`);
            if (cachedTranslation) {
                displayTranslation(tweetElement, cachedTranslation, originalText);
            } else {
                translateTweet(tweetElement, tweetId);
            }
        }
    }

    // 监听时间线变化
    function observeTimeline() {
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        if (node.querySelector && (
                            node.querySelector('article[data-testid="tweet"]') || 
                            node.querySelector('div[data-testid="tweet"]')
                        )) {
                            shouldScan = true;
                        }
                    }
                });
            });

            if (shouldScan) {
                setTimeout(() => scanExistingTweets(), 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 获取推文ID
    function getTweetId(tweetElement) {
        // 从推文链接中提取
        const links = tweetElement.querySelectorAll('a[href*="/status/"]');
        for (const link of links) {
            const href = link.getAttribute('href');
            const match = href.match(/\/status\/(\d+)/);
            if (match) return match[1];
        }

        // 从data属性中提取
        const tweetDiv = tweetElement.closest('div[data-tweet-id]');
        if (tweetDiv) {
            return tweetDiv.getAttribute('data-tweet-id');
        }

        return null;
    }

    // 获取推文文本内容
    function getTweetText(tweetElement) {
        const textSelectors = [
            'div[data-testid="tweetText"]',
            '[data-testid="tweetText"]'
        ];

        for (const selector of textSelectors) {
            const elements = tweetElement.querySelectorAll(selector);
            for (const element of elements) {
                const text = element.textContent.trim();
                if (text && text.length > 5) {
                    return text;
                }
            }
        }

        return null;
    }

    // 翻译推文
    async function translateTweet(tweetElement, tweetId) {
        const config = getConfig();
        if (!config.AUTO_TRANSLATE) return;
        
        const originalText = getTweetText(tweetElement);
        
        if (!originalText || originalText.length < 5) {
            return;
        }

        if (isTweetTranslated(tweetId) && hasTranslationElement(tweetElement)) {
            return;
        }

        saveTranslatedTweet(tweetId);
        
        try {
            if (config.SHOW_LOADING) {
                showLoadingIndicator(tweetElement);
            }
            
            const apiKey = getDecryptedApiKey();
            if (!apiKey) {
                throw new Error('请先配置API密钥');
            }
            
            const translatedText = await callDeepSeekAPI(originalText, apiKey);
            
            if (config.SHOW_LOADING) {
                removeLoadingIndicator(tweetElement);
            }
            
            if (translatedText) {
                GM_setValue(`translation_${tweetId}`, translatedText);
                displayTranslation(tweetElement, translatedText, originalText);
            }
        } catch (error) {
            console.error('翻译失败:', error);
            removeLoadingIndicator(tweetElement);
            displayTranslation(tweetElement, '翻译失败: ' + error.message, originalText);
        }
    }

    // 显示加载指示器
    function showLoadingIndicator(tweetElement) {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'deepseek-loading';
        loadingDiv.textContent = '翻译中...';
        loadingDiv.style.cssText = `
            color: #666;
            font-style: italic;
            padding: 8px;
            font-size: 12px;
        `;
        
        const textContainer = findTextContainer(tweetElement);
        if (textContainer && textContainer.parentNode) {
            textContainer.parentNode.insertBefore(loadingDiv, textContainer.nextSibling);
        }
    }

    // 移除加载指示器
    function removeLoadingIndicator(tweetElement) {
        const loadingElements = tweetElement.querySelectorAll('.deepseek-loading');
        loadingElements.forEach(element => element.remove());
    }

    // 调用DeepSeek API
    function callDeepSeekAPI(text, apiKey) {
        return new Promise((resolve, reject) => {
            const config = getConfig();
            
            if (!apiKey) {
                reject(new Error('请先配置DeepSeek API密钥'));
                return;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.deepseek.com/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                data: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        {
                            role: 'system',
                            content: config.PROMPT
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.3
                }),
                onload: function(response) {
                    if (response.status === 200) {
                        try {
                            const data = JSON.parse(response.responseText);
                            const translatedText = data.choices[0].message.content.trim();
                            resolve(translatedText);
                        } catch (e) {
                            reject(new Error('解析API响应失败'));
                        }
                    } else {
                        reject(new Error(`API请求失败: ${response.status}`));
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }

    // 查找文本容器
    function findTextContainer(tweetElement) {
        return tweetElement.querySelector('div[data-testid="tweetText"]') || 
               tweetElement.querySelector('[data-testid="tweetText"]') ||
               tweetElement;
    }

    // 显示翻译结果
    function displayTranslation(tweetElement, translatedText, originalText) {
        const theme = getCurrentTheme();
        
        const existingTranslation = tweetElement.querySelector('.deepseek-translation');
        if (existingTranslation) {
            existingTranslation.remove();
        }

        const translationDiv = document.createElement('div');
        translationDiv.className = 'deepseek-translation';
        translationDiv.style.cssText = `
            border-left: 3px solid ${theme.accent};
            padding: 12px;
            margin: 8px 0;
            background: ${theme.bgSecondary};
            border-radius: 4px;
            color: ${theme.textPrimary};
            font-size: 14px;
            line-height: 1.4;
            position: relative;
        `;

        const translationHeader = document.createElement('div');
        translationHeader.textContent = '🔍 DeepSeek翻译:';
        translationHeader.style.cssText = `
            font-weight: bold;
            margin-bottom: 8px;
            color: ${theme.accent};
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            background: none;
            border: none;
            color: ${theme.textSecondary};
            cursor: pointer;
            font-size: 16px;
            padding: 0;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        closeButton.onmouseover = () => closeButton.style.backgroundColor = theme.border;
        closeButton.onmouseout = () => closeButton.style.backgroundColor = 'transparent';
        closeButton.onclick = () => translationDiv.remove();

        translationHeader.appendChild(closeButton);

        const translationContent = document.createElement('div');
        translationContent.textContent = translatedText;
        translationContent.style.cssText = `
            color: ${theme.textPrimary};
            white-space: pre-wrap;
            word-wrap: break-word;
        `;

        translationDiv.appendChild(translationHeader);
        translationDiv.appendChild(translationContent);

        const textContainer = findTextContainer(tweetElement);
        if (textContainer && textContainer.parentNode) {
            textContainer.parentNode.insertBefore(translationDiv, textContainer.nextSibling);
        } else {
            tweetElement.appendChild(translationDiv);
        }
    }

    // 安全清理函数
    function secureCleanup() {
        // 清理内存中的敏感数据
        const sensitiveElements = document.querySelectorAll('input[type="password"]');
        sensitiveElements.forEach(input => {
            if (input.value) {
                input.value = '';
            }
        });
    }

    // 主函数：初始化并开始监听
    function init() {
        console.log('DeepSeek翻译器已启动');
        
        GM_registerMenuCommand('配置DeepSeek翻译器', showConfigPanel);
        GM_registerMenuCommand('清除翻译缓存', clearTranslationCache);
        GM_registerMenuCommand('安全清理', secureCleanup);
        
        scanExistingTweets();
        observeTimeline();
        addConfigButton();
        
        // 定期更新配置按钮样式
        setInterval(() => {
            const button = document.getElementById('deepseek-config-button');
            if (button) {
                const theme = getCurrentTheme();
                button.style.background = theme.accent;
                button.onmouseover = () => button.style.background = theme.accentHover;
                button.onmouseout = () => button.style.background = theme.accent;
            }
        }, 5000);

        // 页面卸载时清理敏感数据
        window.addEventListener('beforeunload', secureCleanup);
    }

    // 等待页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }
})();