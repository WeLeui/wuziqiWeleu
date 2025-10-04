// 全局变量
let currentUser = null;
let ws = null;
let currentRoomId = null;
let gameState = {
    board: Array(15).fill().map(() => Array(15).fill(0)), // 0:空, 1:白, 2:黑
    currentPlayer: 2, // 黑棋先行
    moves: 0
};
let isMyTurn = false;
let isBlack = false;

// API基础URL - 统一管理服务器地址和端口
// 使用相对路径或根据当前页面协议自动选择HTTP/HTTPS
const useHttps = window.location.protocol === 'https:';
const BASE_URL = useHttps ? 'https://115.190.169.197:3001' : 'http://115.190.169.197:3001'; // 根据当前页面协议选择合适的API地址
const WS_URL = useHttps ? 'wss://115.190.169.197:3001' : 'ws://115.190.169.197:3001'; // WebSocket服务器地址，注意使用wss对应https
// 音频对象
const audio = {
    move: new Audio('./audio/down.wav'),
    start: new Audio('./audio/start.wav'),
    win: new Audio('./audio/winner.wav'),
    lose: new Audio('./audio/loser.wav'),
    draw: new Audio('./audio/pingju.wav')
};

// 预加载音频
function preloadAudio() {
    // 设置音量（可选）
    Object.values(audio).forEach(sound => {
        sound.volume = 0.5; // 设置音量为50%
    });
    
    // 尝试加载音频（可能需要用户交互后才能完整加载）
    Object.values(audio).forEach(sound => {
        try {
            // 避免使用可能不存在的load()方法
            sound.loaded = false;
            sound.oncanplaythrough = () => {
                sound.loaded = true;
            };
        } catch (e) {
            console.log('音频预加载失败:', e);
        }
    });
}

// 播放音效函数
function playSound(type) {
    try {
        if (!audio[type]) {
            console.warn('未找到指定类型的音效:', type);
            return;
        }
        
        // 创建新的音频实例，避免重用同一实例可能导致的问题
        const soundSrc = audio[type].src;
        const sound = new Audio(soundSrc);
        sound.volume = 0.5;
        
        // 尝试播放，添加更详细的错误处理
        sound.play().then(() => {
            console.log('音效播放成功:', type);
        }).catch(e => {
            console.log('音效播放失败:', type, e);
            
            // 提供更详细的错误类型
            if (e.name === 'NotAllowedError') {
                console.log('提示: 浏览器策略要求用户交互后才能播放音频');
                // 可以在这里添加一个提示，引导用户点击页面
            } else if (e.name === 'NotSupportedError') {
                console.log('提示: 浏览器不支持该音频格式');
            } else if (e.name === 'AbortError') {
                console.log('提示: 音频加载被中止');
            }
        });
    } catch (error) {
        console.error('播放音效时出错:', type, error);
    }
}

// DOM元素
const loginContainer = document.getElementById('login-container');
const mainContainer = document.getElementById('main-container');
const currentUserEl = document.getElementById('current-user');
const userAvatarEl = document.getElementById('user-avatar');
const menuPanel = document.querySelector('.menu-panel');
const roomListEl = document.getElementById('room-list');
const roomsContainer = document.getElementById('rooms-container');
const gamePanel = document.getElementById('game-panel');
const player1El = document.getElementById('player1');
const player2El = document.getElementById('player2');
const player1AvatarEl = document.getElementById('player1-avatar');
const player2AvatarEl = document.getElementById('player2-avatar');
const statusMessageEl = document.getElementById('status-message');
const rankPanel = document.getElementById('rank-panel');
const rankBodyEl = document.getElementById('rank-body');
const modal = document.getElementById('modal');
const modalTitleEl = document.getElementById('modal-title');
const modalBodyEl = document.getElementById('modal-body');
const canvas = document.getElementById('chessboard');
const ctx = canvas.getContext('2d');

// 棋盘参数
let BOARD_SIZE = 15; // 改为变量以支持自适应
let CELL_SIZE; // 单元格大小在resizeCanvas中动态计算
let BOARD_PADDING = 20; // 改为变量以支持自适应

// 初始化
function init() {
    // 预加载音频
    preloadAudio();
    
    // 添加用户交互事件来解锁音频播放（点击页面任何位置）
    document.addEventListener('click', () => {
        // 尝试播放静音的音频来解锁策略限制
        const unlockAudio = new Audio('./audio/down.wav');
        unlockAudio.volume = 0; // 静音播放
        unlockAudio.play().catch(() => {});
    }, { once: true }); // 只执行一次
    
    // 登录事件
    document.getElementById('login-btn').addEventListener('click', login);
    document.getElementById('username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    // 菜单按钮事件
    document.getElementById('create-room-btn').addEventListener('click', showCreateRoomModal);
    document.getElementById('join-room-btn').addEventListener('click', showRoomList);
    document.getElementById('offline-game-btn').addEventListener('click', startOfflineGame);
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // 房间列表按钮事件
    document.getElementById('back-to-menu').addEventListener('click', showMenu);
    
    // 游戏控制按钮事件
    document.getElementById('give-up-btn').addEventListener('click', giveUp);
    document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);
    
    // 模态框关闭事件
    document.querySelector('.close').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // 设置自适应棋盘大小
    resizeCanvas();
    
    // 绑定窗口大小变化事件
    window.addEventListener('resize', resizeCanvas);
    
    // 绑定触摸事件（支持移动设备）
    canvas.addEventListener('touchstart', handleTouchEvent, { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); // 防止页面缩放
    canvas.addEventListener('touchend', handleTouchEvent, { passive: false });
    
    // 棋盘点击事件
    canvas.addEventListener('click', handleCanvasClick);
    
    // 绘制棋盘
    drawChessboard();
}

// 调整画布大小以适应屏幕
function resizeCanvas() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const isMobile = windowWidth < 768;
    
    // 计算合适的棋盘大小
    let maxSize;
    if (isMobile) {
        // 移动设备上使用屏幕宽度的90%
        maxSize = windowWidth * 0.9;
        BOARD_PADDING = 15; // 移动设备上减少边距
    } else {
        // 桌面设备上使用较小的值，确保棋盘不会太大
        maxSize = Math.min(windowWidth * 0.6, windowHeight * 0.8);
        BOARD_PADDING = 20;
    }
    
    // 计算单元格大小
    CELL_SIZE = (maxSize - 2 * BOARD_PADDING) / (BOARD_SIZE - 1);
    
    // 设置画布大小
    canvas.width = maxSize;
    canvas.height = maxSize;
    
    // 调整游戏面板样式
    gamePanel.style.maxWidth = maxSize + 'px';
    
    // 重新绘制棋盘
    if (gameState) {
        drawChessboard();
    }
}

// 处理触摸事件
function handleTouchEvent(event) {
    event.preventDefault(); // 防止页面滚动和缩放
    
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        // 创建一个模拟的鼠标事件
        const clickEvent = new MouseEvent('click', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true,
            cancelable: true
        });
        // 触发点击事件
        canvas.dispatchEvent(clickEvent);
    }
}

// 用户登录 - 离线优先模式
async function login() {
    const username = document.getElementById('username').value.trim();
    
    if (!username) {
        alert('请输入昵称');
        return;
    }
    
    // 优先使用离线登录（不依赖网络）
    // 直接创建本地用户对象
    currentUser = {
        id: Date.now().toString(), // 使用时间戳作为临时ID
        name: username
    };
    
    // 显示主菜单
    currentUserEl.textContent = `欢迎, ${currentUser.name}`;
    userAvatarEl.textContent = username.charAt(0).toUpperCase();
    loginContainer.style.display = 'none';
    mainContainer.style.display = 'block';
    console.log('使用离线模式登录成功');
    
    // 尝试联网登录（可选，用于统计等）
    try {
        const response = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: username })
        });
        
        const data = await response.json();
        if (data.success) {
            // 如果联网成功，更新用户信息
            currentUser = data.user;
            console.log('联网登录成功，更新用户信息:', currentUser);
        }
    } catch (error) {
        console.log('离线登录模式，跳过联网验证', error);
    }
}

// 显示创建房间模态框
function showCreateRoomModal() {
    modalTitleEl.textContent = '创建房间';
    modalBodyEl.innerHTML = `
        <input type="text" id="room-name" placeholder="请输入房间名称" required>
        <button id="confirm-create-room">创建</button>
    `;
    modal.style.display = 'block';
    
    document.getElementById('confirm-create-room').addEventListener('click', createRoom);
}

// 创建房间 - 联网模式，调用后端API
async function createRoom() {
    const roomName = document.getElementById('room-name').value.trim();
    
    if (!roomName) {
        alert('请输入房间名称');
        return;
    }
    
    try {
        // 调用后端创建房间API
        const response = await fetch(`${BASE_URL}/api/rooms`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUser.id,
                roomName: roomName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            modal.style.display = 'none';
            // 加入创建的房间
            joinGameRoom(data.room.id);
        } else {
            alert('创建房间失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        console.error('创建房间API调用失败:', error);
        // 显示友好的错误提示，而不是技术错误
        alert('创建房间失败，请稍后重试或使用人机对战模式');
        modal.style.display = 'none';
    }
}

// 显示加入房间模态框，让用户输入房间号
function showRoomList() {
    modalTitleEl.textContent = '加入房间';
    modalBodyEl.innerHTML = `
        <input type="number" id="room-id-input" placeholder="请输入房间号" required>
        <button id="confirm-join-room">加入</button>
    `;
    modal.style.display = 'block';
    
    document.getElementById('confirm-join-room').addEventListener('click', function() {
        const roomId = document.getElementById('room-id-input').value.trim();
        
        if (!roomId) {
            alert('请输入房间号');
            return;
        }
        
        modal.style.display = 'none';
        joinRoom(roomId);
    });
}

// 加入房间 - 联网模式，调用后端API
async function joinRoom(roomId) {
    try {
        // 调用后端加入房间API
        const response = await fetch(`${BASE_URL}/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUser.id })
        });
        
        const data = await response.json();
        
        if (data.success) {
            roomsContainer.style.display = 'none';
            // 加入游戏房间
            joinGameRoom(roomId);
        } else {
            alert('加入房间失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        console.error('加入房间API调用失败:', error);
        alert('网络连接失败，请检查您的网络连接后重试。');
    }
}

// 加入游戏房间 - 建立WebSocket连接
function joinGameRoom(roomId) {
    currentRoomId = roomId;
    
    // 显示游戏面板并隐藏左侧菜单
    gamePanel.style.display = 'block';
    menuPanel.style.display = 'none'; // 隐藏左侧菜单
    
    try {
        // 建立WebSocket连接
        ws = new WebSocket(`${WS_URL}?userId=${currentUser.id}&roomId=${roomId}`);
        
        ws.onopen = function() {
            console.log('WebSocket连接已建立');
            statusMessageEl.textContent = '正在等待另一位玩家...';
        };
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket错误:', error);
            alert('连接错误，请重试');
            showMenu();
        };
        
        ws.onclose = function() {
            console.log('WebSocket连接已关闭');
            if (currentRoomId) {
                alert('连接已断开');
                showMenu();
            }
        };
    } catch (error) {
        console.error('建立WebSocket连接失败:', error);
        alert('无法连接到游戏服务器');
        showMenu();
    }
}

// WebSocket消息处理函数
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'game_start':
            // 游戏开始
            gameState = data.gameState;
            isBlack = data.isBlack;
            isMyTurn = data.isMyTurn;
            
            // 更新玩家信息
            player1El.textContent = data.player1.name;
            player2El.textContent = data.player2.name;
            player1AvatarEl.textContent = data.player1.name.charAt(0).toUpperCase();
            player2AvatarEl.textContent = data.player2.name.charAt(0).toUpperCase();
            
            statusMessageEl.textContent = isMyTurn ? '轮到你下棋' : '等待对手下棋';
            playSound('start');
            drawChessboard();
            break;
            
        case 'move':
            // 收到落子消息
            if (data.x !== undefined && data.y !== undefined) {
                gameState.board[data.x][data.y] = data.player;
                gameState.moves++;
                isMyTurn = data.isMyTurn;
                playSound('move');
                drawChessboard();
                statusMessageEl.textContent = isMyTurn ? '轮到你下棋' : '等待对手下棋';
            }
            break;
            
        case 'game_over':
            // 游戏结束
            if (data.winnerId === currentUser.id) {
                statusMessageEl.textContent = '恭喜，你赢了！';
                playSound('win');
            } else if (data.isDraw) {
                statusMessageEl.textContent = '平局！';
                playSound('draw');
            } else {
                statusMessageEl.textContent = '很遗憾，你输了！';
                playSound('lose');
            }
            isMyTurn = false;
            break;
            
        case 'player_leave':
            // 玩家离开
            statusMessageEl.textContent = '对手已离开游戏';
            alert('对手已离开游戏');
            break;
            
        case 'error':
            // 错误消息
            alert('错误: ' + data.message);
            break;
    }
}

// 处理棋盘点击 - 智能模式：根据currentRoomId判断使用联网或离线逻辑
function handleCanvasClick(event) {
    if (!isMyTurn) return;
    
    // 计算落子位置
    const rect = canvas.getBoundingClientRect();
    const boardX = Math.round((event.clientX - rect.left - BOARD_PADDING) / CELL_SIZE);
    const boardY = Math.round((event.clientY - rect.top - BOARD_PADDING) / CELL_SIZE);
    
    // 检查坐标是否有效
    if (boardX >= 0 && boardX < BOARD_SIZE && boardY >= 0 && boardY < BOARD_SIZE && gameState.board[boardX][boardY] === 0) {
        // 播放落子音效
        playSound('move');
        
        // 根据是否有人机对战模式选择处理逻辑
        if (currentRoomId === null) {
            // 人机对战模式（完全离线）
            gameState.board[boardX][boardY] = 2; // 玩家执黑
            gameState.moves++;
            drawChessboard();
            
            // 检查玩家是否获胜
            if (checkWin(gameState.board, boardX, boardY, 2)) {
                playSound('win');
                statusMessageEl.textContent = '恭喜你获胜！';
                isMyTurn = false;
                return;
            } else if (gameState.moves >= BOARD_SIZE * BOARD_SIZE) {
                playSound('draw');
                statusMessageEl.textContent = '平局！';
                isMyTurn = false;
                return;
            }
            
            // 轮到AI下棋
            isMyTurn = false;
            statusMessageEl.textContent = '电脑思考中...';
            
            // 模拟AI延迟
            setTimeout(() => {
                // 使用优化的AI算法获取落子位置
                const aiMove = getAIMove();
                const aiX = aiMove.x;
                const aiY = aiMove.y;
                
                gameState.board[aiX][aiY] = 1; // AI执白
                gameState.moves++;
                playSound('move');
                drawChessboard();
                
                // 检查AI是否获胜
                if (checkWin(gameState.board, aiX, aiY, 1)) {
                    playSound('lose');
                    statusMessageEl.textContent = '很遗憾，你输了！';
                    isMyTurn = false;
                    return;
                } else if (gameState.moves >= BOARD_SIZE * BOARD_SIZE) {
                    playSound('draw');
                    statusMessageEl.textContent = '平局！';
                    isMyTurn = false;
                    return;
                }
                
                // 轮到玩家
                isMyTurn = true;
                statusMessageEl.textContent = '轮到你下棋';
            }, 800);
        } else {
            // 联网模式：发送落子消息给服务器
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'move',
                    x: boardX,
                    y: boardY,
                    roomId: currentRoomId
                }));
            }
        }
    }
}

// 绘制棋盘
function drawChessboard() {
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 设置棋盘背景
    ctx.fillStyle = '#DEB887';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格线
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < BOARD_SIZE; i++) {
        // 水平线
        ctx.beginPath();
        ctx.moveTo(BOARD_PADDING, BOARD_PADDING + i * CELL_SIZE);
        ctx.lineTo(BOARD_PADDING + (BOARD_SIZE - 1) * CELL_SIZE, BOARD_PADDING + i * CELL_SIZE);
        ctx.stroke();
        
        // 垂直线
        ctx.beginPath();
        ctx.moveTo(BOARD_PADDING + i * CELL_SIZE, BOARD_PADDING);
        ctx.lineTo(BOARD_PADDING + i * CELL_SIZE, BOARD_PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
        ctx.stroke();
    }
    
    // 绘制天元和星
    const starPoints = [
        [3, 3], [3, 11], [7, 7], [11, 3], [11, 11]
    ];
    
    starPoints.forEach(([x, y]) => {
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(
            BOARD_PADDING + x * CELL_SIZE,
            BOARD_PADDING + y * CELL_SIZE,
            3,
            0,
            2 * Math.PI
        );
        ctx.fill();
    });
    
    // 绘制棋子
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] !== 0) {
                const isBlack = gameState.board[i][j] === 2;
                
                // 绘制棋子阴影
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 5;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                
                // 绘制棋子
                ctx.fillStyle = isBlack ? '#000' : '#fff';
                ctx.beginPath();
                ctx.arc(
                    BOARD_PADDING + i * CELL_SIZE,
                    BOARD_PADDING + j * CELL_SIZE,
                    CELL_SIZE / 2 - 2,
                    0,
                    2 * Math.PI
                );
                ctx.fill();
                
                // 绘制边框
                ctx.shadowColor = 'transparent';
                ctx.strokeStyle = isBlack ? '#333' : '#ddd';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }
    
    // 绘制当前回合指示器（自适应大小）
    const indicatorSize = Math.max(8, CELL_SIZE / 5); // 最小8px，最大为单元格的1/5
    const indicatorX = Math.max(20, BOARD_PADDING / 1.5); // 位置自适应
    const indicatorY = Math.max(20, BOARD_PADDING / 1.5);
    
    ctx.fillStyle = gameState.currentPlayer === 2 ? '#000' : '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, indicatorSize, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
}

// 开始人机对战 - 完全离线模式
function startOfflineGame() {
    menuPanel.style.display = 'none';
    gamePanel.style.display = 'block';
    
    // 重置游戏状态
    gameState = {
        board: Array(15).fill().map(() => Array(15).fill(0)),
        currentPlayer: 2,
        moves: 0
    };
    
    // 更新玩家信息
    player1El.textContent = currentUser.name;
    player2El.textContent = '电脑';
    player1AvatarEl.textContent = currentUser.name.charAt(0).toUpperCase();
    player2AvatarEl.textContent = 'C';
    statusMessageEl.textContent = '轮到你下棋';
    
    isMyTurn = true;
    isBlack = true;
    currentRoomId = null; // 设置为null表示人机对战模式
    gameOver = false;
    
    // 播放开始音效
    playSound('start');
    
    // 绘制棋盘
    drawChessboard();
    
    // 使用统一的点击事件处理函数
    canvas.onclick = handleCanvasClick;
}

// 处理人机对战棋盘点击
function handleOfflineCanvasClick(event) {
    if (!isMyTurn) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const boardX = Math.round((x - BOARD_PADDING) / CELL_SIZE);
    const boardY = Math.round((y - BOARD_PADDING) / CELL_SIZE);
    
    if (boardX >= 0 && boardX < BOARD_SIZE && boardY >= 0 && boardY < BOARD_SIZE) {
        if (gameState.board[boardX][boardY] === 0) {
            // 播放落子音效
            playSound('move');
            
            // 玩家下棋
            gameState.board[boardX][boardY] = 2; // 玩家执黑
            gameState.moves++;
            drawChessboard();
            
            // 检查玩家是否获胜
            if (checkWin(gameState.board, boardX, boardY, 2)) {
                playSound('win');
                statusMessageEl.textContent = '恭喜你获胜！';
                isMyTurn = false;
                return;
            }
            
            // 检查是否平局
            if (gameState.moves === 225) {
                playSound('draw');
                statusMessageEl.textContent = '游戏结束，平局';
                isMyTurn = false;
                return;
            }
            
            isMyTurn = false;
            statusMessageEl.textContent = '电脑思考中...';
            
            // 电脑下棋（延迟一下模拟思考）
            setTimeout(() => {
                const aiMove = getAIMove();
                // 播放落子音效
                playSound('move');
                
                gameState.board[aiMove.x][aiMove.y] = 1; // 电脑执白
                gameState.moves++;
                drawChessboard();
                
                // 检查电脑是否获胜
                if (checkWin(gameState.board, aiMove.x, aiMove.y, 1)) {
                    playSound('lose');
                    statusMessageEl.textContent = '游戏结束，你输了';
                    isMyTurn = false;
                    return;
                }
                
                isMyTurn = true;
                statusMessageEl.textContent = '轮到你下棋';
            }, 1000);
        }
    }
}

// 获取AI下棋位置（优化版AI）
function getAIMove() {
    let bestScore = -Infinity;
    let bestMove = null;
    let moveScores = [];
    
    // 对每个空位进行评分
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] === 0) {
                // 检查是否有邻近棋子，如果没有则跳过（减少不必要的计算）
                if (!hasNearbyPiece(i, j) && gameState.moves > 5) {
                    continue;
                }
                
                // 计算AI落子的分数
                gameState.board[i][j] = 1; // AI执白
                const aiScore = evaluatePosition(gameState.board, i, j, 1);
                gameState.board[i][j] = 0; // 撤销
                
                // 计算玩家落子的分数（防御）
                gameState.board[i][j] = 2; // 玩家执黑
                const playerScore = evaluatePosition(gameState.board, i, j, 2);
                gameState.board[i][j] = 0; // 撤销
                
                // 优化评分机制：根据游戏阶段动态调整进攻/防守权重
                let attackWeight = 0.55;
                let defenseWeight = 0.45;
                
                // 游戏初期更注重布局，中后期更注重进攻
                if (gameState.moves < 15) {
                    attackWeight = 0.45;
                    defenseWeight = 0.45;
                } else if (gameState.moves > 40) {
                    attackWeight = 0.65;
                    defenseWeight = 0.35;
                }
                
                // 综合评分
                let score = aiScore * attackWeight + playerScore * defenseWeight;
                
                // 优化位置评估：根据与中心距离动态调整加分
                const centerDist = Math.sqrt(Math.pow(i - 7, 2) + Math.pow(j - 7, 2));
                score += Math.max(0, 100 - centerDist * 10); // 中心加分，距离越远加分越少
                
                // 记录有价值的位置
                if (score > 100) {
                    moveScores.push({ x: i, y: j, score: score });
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = { x: i, y: j };
                }
            }
        }
    }
    
    // 从高分位置中随机选择（增加AI行为的不确定性）
    if (moveScores.length > 0) {
        // 只保留前30%的高分位置
        const topMoves = moveScores
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.ceil(moveScores.length * 0.3));
        
        // 从高分位置中随机选择一个
        if (topMoves.length > 1 && Math.random() < 0.3) { // 30%概率随机选择
            const randomIndex = Math.floor(Math.random() * topMoves.length);
            return topMoves[randomIndex];
        }
    }
    
    return bestMove || { x: 7, y: 7 }; // 确保总是有一个有效位置
}

// 检查是否有邻近棋子（优化性能）
function hasNearbyPiece(x, y) {
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
                if (gameState.board[nx][ny] !== 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

// 评估位置价值
function evaluatePosition(board, x, y, player) {
    const directions = [
        [1, 0],   // 水平
        [0, 1],   // 垂直
        [1, 1],   // 对角线
        [1, -1]   // 反对角线
    ];
    
    let totalScore = 0;
    let directionScores = [];
    
    for (const [dx, dy] of directions) {
        // 检查该方向的棋子情况
        const score = evaluateDirection(board, x, y, dx, dy, player);
        directionScores.push(score);
        totalScore += score;
    }
    
    // 额外考虑棋型组合的价值（如双三、双四等）
    const highScores = directionScores.filter(s => s >= 500);
    if (highScores.length >= 2) {
        totalScore += 5000; // 双三或以上组合加成
    }
    
    return totalScore;
}

// 评估特定方向的价值
function evaluateDirection(board, x, y, dx, dy, player) {
    let count = 1; // 当前位置的棋子
    let spaceCount = 0;
    let blockedCount = 0;
    let isLive = true;
    
    // 检查正方向
    for (let i = 1; i <= 5; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        
        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
            if (board[nx][ny] === player) {
                count++;
            } else if (board[nx][ny] === 0) {
                spaceCount++;
                break; // 遇到空位，停止计数
            } else {
                blockedCount++;
                isLive = false;
                break; // 遇到对方棋子，停止计数
            }
        } else {
            blockedCount++;
            isLive = false;
            break; // 超出边界
        }
    }
    
    // 检查反方向
    for (let i = 1; i <= 5; i++) {
        const nx = x - dx * i;
        const ny = y - dy * i;
        
        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
            if (board[nx][ny] === player) {
                count++;
            } else if (board[nx][ny] === 0) {
                spaceCount++;
                break; // 遇到空位，停止计数
            } else {
                blockedCount++;
                isLive = false;
                break; // 遇到对方棋子，停止计数
            }
        } else {
            blockedCount++;
            isLive = false;
            break; // 超出边界
        }
    }
    
    // 根据棋型返回不同的分数
    if (count >= 5) return 100000; // 五连子（必胜）
    if (count === 4 && isLive) return 10000; // 活四
    if (count === 4) return 1000; // 冲四
    if (count === 3 && isLive) return 500; // 活三
    if (count === 3) return 100; // 冲三
    if (count === 2 && isLive) return 50; // 活二
    if (count === 2) return 10; // 冲二
    if (count === 1) return 1; // 单子
    
    return 0;
}

// 检查胜负
function checkWin(board, x, y, player) {
    const directions = [
        [1, 0],   // 水平
        [0, 1],   // 垂直
        [1, 1],   // 对角线
        [1, -1]   // 反对角线
    ];
    
    for (const [dx, dy] of directions) {
        let count = 1;
        
        // 正方向检查
        for (let i = 1; i < 5; i++) {
            const nx = x + dx * i;
            const ny = y + dy * i;
            if (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[nx][ny] === player) {
                count++;
            } else {
                break;
            }
        }
        
        // 反方向检查
        for (let i = 1; i < 5; i++) {
            const nx = x - dx * i;
            const ny = y - dy * i;
            if (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[nx][ny] === player) {
                count++;
            } else {
                break;
            }
        }
        
        if (count >= 5) {
            return true;
        }
    }
    
    return false;
}

// AI移动函数 - 简单的AI逻辑
function makeAIMove() {
    // 尝试找到一个空位
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] === 0) {
                // 播放落子音效
                playSound('move');
                
                // AI落子
                gameState.board[i][j] = gameState.currentPlayer;
                gameState.moves++;
                
                // 绘制更新后的棋盘
                drawChessboard();
                
                // 检查游戏是否结束
                if (checkWin(i, j)) {
                    statusMessageEl.textContent = '很遗憾，你输了！';
                    playSound('lose');
                    return;
                } else if (gameState.moves >= BOARD_SIZE * BOARD_SIZE) {
                    statusMessageEl.textContent = '平局！';
                    playSound('draw');
                    return;
                }
                
                // 切换玩家，轮到用户
                gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
                isMyTurn = true;
                
                return;
            }
        }
    }
}

// 重置游戏状态
function resetGameState() {
    gameState = {
        board: Array(15).fill().map(() => Array(15).fill(0)), // 0:空, 1:白, 2:黑
        currentPlayer: 2, // 黑棋先行
        moves: 0
    };
    isMyTurn = false;
    isBlack = false;
    currentRoomId = null;
    
    // 清空棋盘
    drawChessboard();
}

// 认输 - 联网模式版本
function giveUp() {
    if (confirm('确定要认输吗？')) {
        // 联网模式：发送认输消息给服务器
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'give_up',
                roomId: currentRoomId
            }));
        }
        statusMessageEl.textContent = '你已认输！';
        playSound('lose');
        resetGameState();
        showMenu();
    }
}

// 离开房间
function leaveRoom() {
    if (confirm('确定要离开游戏吗？')) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'leave',
                roomId: currentRoomId
            }));
            ws.close();
        }
        resetGameState();
        showMenu();
    }
}

// 显示菜单
function showMenu() {
    // 确保关闭WebSocket连接
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    
    roomListEl.style.display = 'none';
    gamePanel.style.display = 'none';
    menuPanel.style.display = 'block';
    
    // 重置游戏状态
    gameState = {
        board: Array(15).fill().map(() => Array(15).fill(0)),
        currentPlayer: 2,
        moves: 0
    };
    
    currentRoomId = null;
    isMyTurn = false;
    isBlack = false;
    
    // 重新绑定点击事件
    canvas.onclick = handleCanvasClick;
    
    drawChessboard();
}

// 退出登录
function logout() {
    currentUser = null;
    currentRoomId = null;
    mainContainer.style.display = 'none';
    loginContainer.style.display = 'block';
    document.getElementById('username').value = '';
}

// 页面加载完成后初始化
window.onload = init;