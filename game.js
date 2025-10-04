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

// 音频对象
const audio = {
    move: new Audio('../../audio/down.wav'),
    start: new Audio('../../audio/start.wav'),
    win: new Audio('../../audio/winner.wav'),
    lose: new Audio('../../audio/loser.wav'),
    draw: new Audio('../../audio/pingju.wav')
};

// 播放音效函数
function playSound(type) {
    try {
        // 停止当前播放并重置
        if (audio[type]) {
            audio[type].pause();
            audio[type].currentTime = 0;
            audio[type].play().catch(e => console.log('音效播放失败:', e));
        }
    } catch (error) {
        console.error('播放音效时出错:', error);
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
const BOARD_SIZE = 15;
const CELL_SIZE = canvas.width / BOARD_SIZE;
const BOARD_PADDING = 20;

// 初始化
function init() {
    // 登录事件
    document.getElementById('login-btn').addEventListener('click', login);
    document.getElementById('username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    // 菜单按钮事件
    document.getElementById('create-room-btn').addEventListener('click', showCreateRoomModal);
    document.getElementById('join-room-btn').addEventListener('click', showRoomList);
    document.getElementById('offline-game-btn').addEventListener('click', startOfflineGame);
    document.getElementById('rank-btn').addEventListener('click', showRankings);
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // 房间列表按钮事件
    document.getElementById('back-to-menu').addEventListener('click', showMenu);
    
    // 游戏控制按钮事件
    document.getElementById('give-up-btn').addEventListener('click', giveUp);
    document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);
    
    // 排行榜按钮事件
    document.getElementById('back-from-rank').addEventListener('click', showMenu);
    
    // 模态框关闭事件
    document.querySelector('.close').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // 棋盘点击事件
    canvas.addEventListener('click', handleCanvasClick);
    
    // 绘制棋盘
    drawChessboard();
}

// 用户登录
async function login() {
    const username = document.getElementById('username').value.trim();
    
    if (!username) {
        alert('请输入昵称');
        return;
    }
    
    try {
        // 模拟登录成功，本地创建用户对象
        currentUser = {
            id: Date.now(), // 使用时间戳作为临时ID
            name: username
        };
        
        currentUserEl.textContent = `欢迎, ${currentUser.name}`;
        // 设置头像为用户名的首字母大写
        userAvatarEl.textContent = username.charAt(0).toUpperCase();
        loginContainer.style.display = 'none';
        mainContainer.style.display = 'block';
    } catch (error) {
        alert('登录错误: ' + error.message);
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

// 创建房间
async function createRoom() {
    const roomName = document.getElementById('room-name').value.trim() || `房间${Date.now()}`;
    
    try {
        const response = await fetch('http://localhost:3000/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUser.id, roomName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            modal.style.display = 'none';
            currentRoomId = data.room.id;
            joinGameRoom(currentRoomId, true);
        } else {
            alert('创建房间失败: ' + data.error);
        }
    } catch (error) {
        alert('创建房间错误: ' + error.message);
    }
}

// 显示房间列表
async function showRoomList() {
    menuPanel.style.display = 'none';
    roomListEl.style.display = 'block';
    
    try {
        const response = await fetch('http://localhost:3000/api/rooms');
        const data = await response.json();
        
        if (data.success) {
            roomsContainer.innerHTML = '';
            
            if (data.rooms.length === 0) {
                roomsContainer.innerHTML = '<p>暂无可用房间</p>';
            } else {
                data.rooms.forEach(room => {
                    const roomItem = document.createElement('div');
                    roomItem.className = 'room-item';
                    roomItem.innerHTML = `
                        <div>房间名称: ${room.roomName}</div>
                        <div>等待玩家加入...</div>
                    `;
                    roomItem.addEventListener('click', () => {
                        joinRoom(room.id);
                    });
                    roomsContainer.appendChild(roomItem);
                });
            }
        }
    } catch (error) {
        alert('获取房间列表错误: ' + error.message);
    }
}

// 加入房间
async function joinRoom(roomId) {
    try {
        const response = await fetch(`http://localhost:3000/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUser.id })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentRoomId = roomId;
            joinGameRoom(roomId, false);
        } else {
            alert('加入房间失败: ' + data.error);
        }
    } catch (error) {
        alert('加入房间错误: ' + error.message);
    }
}

// 加入游戏房间（建立WebSocket连接）
function joinGameRoom(roomId, isCreator) {
    roomListEl.style.display = 'none';
    gamePanel.style.display = 'block';
    
    isBlack = isCreator;
    
    // 更新玩家信息
    player1El.textContent = isCreator ? currentUser.name : '等待玩家...';
    player2El.textContent = isCreator ? '等待玩家...' : currentUser.name;
    player1AvatarEl.textContent = isCreator ? currentUser.name.charAt(0).toUpperCase() : '?';
    player2AvatarEl.textContent = isCreator ? '?' : currentUser.name.charAt(0).toUpperCase();
    
    statusMessageEl.textContent = isCreator ? '等待对手加入...' : '等待游戏开始...';
    
    // 建立WebSocket连接
    try {
        ws = new WebSocket(`ws://localhost:3000?userId=${currentUser.id}&roomId=${roomId}`);
        
        ws.onopen = () => {
            console.log('WebSocket连接已建立');
        };
        
        ws.onmessage = (event) => {
            handleWebSocketMessage(event.data);
        };
        
        ws.onclose = () => {
            console.log('WebSocket连接已关闭');
            statusMessageEl.textContent = '连接已断开';
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket错误:', error);
            alert('连接错误，请刷新页面重试');
        };
    } catch (error) {
        alert('建立连接失败: ' + error.message);
    }
}

// 处理WebSocket消息
function handleWebSocketMessage(data) {
    const message = JSON.parse(data);
    
    switch (message.type) {
        case 'game_state':
            // 初始化游戏状态
            gameState = message.data;
            drawChessboard();
            // 播放游戏开始音效
            playSound('start');
            break;
            
        case 'move':
            // 更新棋盘和游戏状态
            gameState = {
                board: message.board,
                currentPlayer: message.nextPlayer,
                moves: gameState.moves + 1
            };
            
            // 播放落子音效
            playSound('move');
            
            drawChessboard();
            isMyTurn = (isBlack && message.nextPlayer === 2) || (!isBlack && message.nextPlayer === 1);
            statusMessageEl.textContent = isMyTurn ? '轮到你下棋' : '等待对手下棋';
            break;
            
        case 'win':
            // 显示胜利消息
            const isWinner = message.winner === currentUser.id.toString();
            statusMessageEl.textContent = isWinner ? '恭喜你获胜！' : '游戏结束，你输了';
            drawChessboard();
            // 播放胜利或失败音效
            playSound(isWinner ? 'win' : 'lose');
            break;
            
        case 'draw':
            // 显示平局消息
            statusMessageEl.textContent = '游戏结束，平局';
            drawChessboard();
            // 播放平局音效
            playSound('draw');
            break;
    }
}

// 处理棋盘点击
function handleCanvasClick(event) {
    if (!isMyTurn || !currentRoomId) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // 转换为棋盘坐标
    const boardX = Math.round((x - BOARD_PADDING) / CELL_SIZE);
    const boardY = Math.round((y - BOARD_PADDING) / CELL_SIZE);
    
    // 检查坐标是否有效
    if (boardX >= 0 && boardX < BOARD_SIZE && boardY >= 0 && boardY < BOARD_SIZE) {
        // 检查是否为空位
        if (gameState.board[boardX][boardY] === 0) {
            // 播放落子音效
            playSound('move');
            
            // 发送移动消息
            ws.send(JSON.stringify({
                type: 'move',
                x: boardX,
                y: boardY
            }));
            
            isMyTurn = false;
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
    
    // 绘制当前回合指示器
    ctx.fillStyle = gameState.currentPlayer === 2 ? '#000' : '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(30, 30, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
}

// 开始人机对战
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
    currentRoomId = null;
    
    // 播放开始音效
    playSound('start');
    
    // 绘制棋盘
    drawChessboard();
    
    // 重新绑定点击事件用于人机对战
    canvas.onclick = handleOfflineCanvasClick;
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

// 获取AI下棋位置（增强版AI）
function getAIMove() {
    let bestScore = -Infinity;
    let bestMove = null;
    
    // 对每个空位进行评分
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] === 0) {
                // 计算AI落子的分数
                gameState.board[i][j] = 1; // AI执白
                const aiScore = evaluatePosition(gameState.board, i, j, 1);
                gameState.board[i][j] = 0; // 撤销
                
                // 计算玩家落子的分数（防御）
                gameState.board[i][j] = 2; // 玩家执黑
                const playerScore = evaluatePosition(gameState.board, i, j, 2);
                gameState.board[i][j] = 0; // 撤销
                
                // 综合评分（进攻略优于防守）
                let score = aiScore * 0.55 + playerScore * 0.45;
                
                // 如果是中心区域，额外加分
                if (i >= 5 && i <= 9 && j >= 5 && j <= 9) {
                    score += 100;
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = { x: i, y: j };
                }
            }
        }
    }
    
    return bestMove || { x: 7, y: 7 }; // 确保总是有一个有效位置
}

// 评估位置价值
function evaluatePosition(board, x, y, player) {
    const directions = [
        [1, 0],   // 水平
        [0, 1],   // 垂直
        [1, 1],   // 对角线
        [1, -1]   // 反对角线
    ];
    
    let maxScore = 0;
    
    for (const [dx, dy] of directions) {
        // 检查该方向的棋子情况
        const score = evaluateDirection(board, x, y, dx, dy, player);
        maxScore = Math.max(maxScore, score);
    }
    
    return maxScore;
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

// 显示排行榜
async function showRankings() {
    menuPanel.style.display = 'none';
    rankPanel.style.display = 'block';
    
    try {
        // 这里应该调用API获取排行榜数据
        // 暂时使用模拟数据
        const mockRanks = [
            { id: 1, name: '玩家1', winNum: 15, loseNum: 3, tiedNum: 2 },
            { id: 2, name: '玩家2', winNum: 12, loseNum: 5, tiedNum: 3 },
            { id: 3, name: '玩家3', winNum: 10, loseNum: 4, tiedNum: 6 },
            { id: 4, name: '玩家4', winNum: 8, loseNum: 7, tiedNum: 5 },
            { id: 5, name: '玩家5', winNum: 6, loseNum: 9, tiedNum: 5 }
        ];
        
        rankBodyEl.innerHTML = '';
        
        mockRanks.forEach((user, index) => {
            const totalGames = user.winNum + user.loseNum + user.tiedNum;
            const winRate = totalGames > 0 ? ((user.winNum / totalGames) * 100).toFixed(1) : 0;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${user.name}</td>
                <td>${user.winNum}</td>
                <td>${user.loseNum}</td>
                <td>${user.tiedNum}</td>
                <td>${winRate}%</td>
            `;
            rankBodyEl.appendChild(row);
        });
    } catch (error) {
        alert('获取排行榜失败: ' + error.message);
    }
}

// 认输
function giveUp() {
    if (confirm('确定要认输吗？')) {
        if (currentRoomId && ws) {
            ws.send(JSON.stringify({ type: 'give_up' }));
        }
        showMenu();
    }
}

// 离开房间
function leaveRoom() {
    if (confirm('确定要离开房间吗？')) {
        if (currentRoomId && ws) {
            ws.send(JSON.stringify({ type: 'leave' }));
            ws.close();
        }
        showMenu();
    }
}

// 显示菜单
function showMenu() {
    roomListEl.style.display = 'none';
    gamePanel.style.display = 'none';
    rankPanel.style.display = 'none';
    menuPanel.style.display = 'block';
    
    // 重置游戏状态
    gameState = {
        board: Array(15).fill().map(() => Array(15).fill(0)),
        currentPlayer: 2,
        moves: 0
    };
    
    currentRoomId = null;
    isMyTurn = false;
    
    // 重新绑定点击事件
    canvas.onclick = handleCanvasClick;
    
    drawChessboard();
}

// 退出登录
function logout() {
    if (ws) {
        ws.close();
    }
    
    currentUser = null;
    currentRoomId = null;
    mainContainer.style.display = 'none';
    loginContainer.style.display = 'block';
    document.getElementById('username').value = '';
}

// 页面加载完成后初始化
window.onload = init;