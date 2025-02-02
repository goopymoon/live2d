const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const nativeTheme = require("electron");

nativeTheme.themeSource = "dark";

// Parameters
const datasetRoot = "dataset"; // Root of dataset directory
const outputRoot = "output"; // Root of output directory
const blacklistPath = path.join(outputRoot, "blacklist.txt"); // Blacklist path
const baseResolution = 1024;
const ignoreGeneratedJson = true; // Ignore the generated JSON file
const ignoreOriginalJson = true; // Ignore the original JSON file
const batchOperationMinDelay = 1000;
const batchOperationDelayRange = 1000;

var thisRef = this;
let modelJsonIds = {};

var getPartIDs = function (modelImpl) {
    let partIDs = [];
    partsDataList = modelImpl._$Xr();
    partsDataList.forEach((element) => {
        partIDs.push(element._$NL.id);
    });
    return partIDs;
};

var getParamIDs = function (modelImpl) {
    let paramIDs = [];
    paramDefSet = modelImpl._$E2()._$4S;
    paramDefSet.forEach((element) => {
        paramIDs.push(element._$wL.id);
    });
    return paramIDs;
};

// JavaScriptで発生したエラーを取得
window.onerror = function (msg, url, line, col, error) {
    var errmsg = "file:" + url + "<br>line:" + line + " " + msg;
    l2dError(errmsg);
};

async function getPlatform() {
    if (window.navigator.userAgentData) {
        const data = await navigator.userAgentData.getHighEntropyValues(["platform"]);
        return data.platform.toLowerCase();
    } else {
        return navigator.userAgent.toLowerCase();
    }
}

function viewer() {
    this.platform = getPlatform();

    this.live2DMgr = new LAppLive2DManager();

    this.isDrawStart = false;

    this.gl = null;
    this.canvas = null;

    this.dragMgr = null; /*new L2DTargetPoint();*/ // ドラッグによるアニメーションの管理
    this.viewMatrix = null; /*new L2DViewMatrix();*/
    this.projMatrix = null; /*new L2DMatrix44()*/
    this.deviceToScreen = null; /*new L2DMatrix44();*/

    this.drag = false; // ドラッグ中かどうか
    this.oldLen = 0; // 二本指タップした時の二点間の距離

    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.isModelShown = false;

    this.isPlay = true;
    this.isLookRandom = false;
    this.frameCount = 0;

    // Shortcut keys
    document.addEventListener("keydown", function (e) {
        var keyCode = e.keyCode;
        if (keyCode == 90) {
            // z key
            viewer.changeModel(-1);
        } else if (keyCode == 88) {
            // x key
            viewer.changeModel(1);
        } else if (keyCode == 32) {
            // space key
            viewer.flagBlacklist();
        }
    });

    this.blacklist = [];

    if (fs.existsSync(blacklistPath)) {
        this.blacklist = fs.readFileSync(blacklistPath, "utf-8")
            .split("\n")
            .map(item => item.trim()) // 공백 제거
            .filter(item => item.length > 0) // 빈 줄 제거
            .map(item => path.join(datasetRoot, item)); // datasetRoot와 결합
    }

    // モデル描画用canvasの初期化
    viewer.initL2dCanvas("glcanvas");

    // モデル用マトリクスの初期化と描画の開始
    viewer.init();
}

viewer.goto = function () {
    live2DMgr.count = parseInt(document.getElementById("editGoto").value) - 1;
    viewer.changeModel(0);
};

viewer.save = function (filepath = path.join(outputRoot, "image.png")) {
    try {
        // Save canvas to png file
        var img = canvas.toDataURL();   // canvas의 내용을 Data URL 형식으로 가져옴
        if (img.length === 0) {
            console.error("Canvas is empty, nothing to save!");
            return;
        }
        
        var data = img.replace(/^data:image\/\w+;base64,/, ""); // Data URL에서 Base64 데이터만 추출
        var buf = Buffer.from(data, "base64");  // Base64 데이터를 바이너리 형식의 버퍼로 변환

        // 비동기 방식으로 파일 저장
        fs.writeFile(filepath, buf, (err) => {
            if (err) {
                console.error("Error saving the image:", err);
            } else {
                console.log("Image saved successfully!");
            }
        });
    } catch (error) {
        console.error("An error occurred while saving the image:", error);
    }
};

viewer.saveLayer = function (dir = path.join(outputRoot, "layer")) {
    // Create dir
    fs.mkdirSync(dir, { recursive: true });

    // Keep previous playing state, and set to pause to stop calling draw()
    var prevIsPlay = isPlay;
    isPlay = false;

    // Remember to update the model before calling getElementList()
    var model = live2DMgr.getModel(0);
    model.update(frameCount);
    var elementList = model.live2DModel.getElementList();

    // Save images for each element
    MatrixStack.reset();
    MatrixStack.loadIdentity();
    MatrixStack.multMatrix(projMatrix.getArray());
    MatrixStack.multMatrix(viewMatrix.getArray());
    MatrixStack.push();

    // Draw an image with all elements
    viewer.save(path.join(dir, "all.png"));

    elementList.forEach((item, index) => {
        var element = item.element;
        var partID = item.partID;
        var order = ("000" + index).slice(-4);
        gl.clear(gl.COLOR_BUFFER_BIT);
        model.drawElement(gl, element);
        // Separate directory for each partID
        if (!fs.existsSync(path.join(dir, partID))) {
            fs.mkdirSync(path.join(dir, partID));
        }
        viewer.save(path.join(dir, partID, order + "_" + partID + ".png"));
    });

    MatrixStack.pop();

    isPlay = prevIsPlay;
};

viewer.togglePlayPause = function () {
    isPlay = !isPlay;
    btnPlayPause.textContent = isPlay ? "Pause" : "Play";
};

viewer.secret = function () {
    // Print model stat
    var live2DModel = live2DMgr.getModel(0).live2DModel;
    var modelImpl = live2DModel.getModelImpl();

    console.log("[getPartIDs]", getPartIDs(modelImpl));
    console.log("[getParamIDs]", getParamIDs(modelImpl));

    parts = modelImpl._$F2;
    partsCount = parts.length;
    var elementCount = 0;
    parts.forEach((element) => {
        console.log(element.getDrawData());
        elementCount += element.getDrawData().length;
    });
    console.log("[partCount]", partsCount);
    console.log("[elementCount]", elementCount);
};

// TODO
viewer.batch = function () {
    var count = live2DMgr.getCount();
    op = function () {
        if (count < live2DMgr.modelJsonList.length) {
            var curModelPath = live2DMgr.modelJsonList[count];
            var id = modelJsonIds[curModelPath];
            var curMotion = live2DMgr.currentIdleMotion();
            var progress =
                "[" +
                (count + 1) +
                "/" +
                live2DMgr.modelJsonList.length +
                "] " +
                "[" +
                (curMotion + 1) +
                "/" +
                live2DMgr.idleMotionNum() +
                "] " +
                curModelPath;
            console.log("[batch]", progress);
            var tag =
                ("000" + (id + 1)).slice(-4) +
                "_mtn" +
                ("0" + (curMotion + 1)).slice(-2);
            var dir = path.join(outputRoot, tag);
            console.log("[batch] output to", dir);
            fs.mkdirSync(dir, { recursive: true });
            viewer.saveLayer(dir);
            if (!live2DMgr.nextIdleMotion()) {
                viewer.changeModel(1);
                count++;
            }
            // Make a delay here
            var delay =
                batchOperationMinDelay +
                Math.floor(Math.random() * batchOperationDelayRange);
            console.log(
                "[batch] next operation will be started after",
                delay,
                "ms"
            );
            setTimeout(op, delay);
        }
    };
    // Start op
    op();
};

viewer.resize = function () {
    const baseHeight = 1024;

    live2DModel = live2DMgr.getModel(0).live2DModel;
    if (live2DModel == null) return;

    var modelWidth = live2DModel.getCanvasWidth();
    var modelHeight = live2DModel.getCanvasHeight();
    if (modelHeight > modelWidth) {
        // Portrait
        canvas.width = baseResolution;
        canvas.height = (modelHeight / modelWidth) * baseResolution;
    } else {
        canvas.width = (modelWidth / modelHeight) * baseResolution;
        canvas.height = baseResolution;
    }

    // canvas.width = live2DModel.getCanvasWidth() / live2DModel.getCanvasHeight() * baseHeight;
    // canvas.height = baseHeight;

    // ビュー行列
    var ratio = canvas.height / canvas.width;
    var left = LAppDefine.VIEW_LOGICAL_LEFT;
    var right = LAppDefine.VIEW_LOGICAL_RIGHT;
    var bottom = -ratio;
    var top = ratio;

    viewMatrix = new L2DViewMatrix();

    // デバイスに対応する画面の範囲。 Xの左端, Xの右端, Yの下端, Yの上端
    viewMatrix.setScreenRect(left, right, bottom, top);

    // デバイスに対応する画面の範囲。 Xの左端, Xの右端, Yの下端, Yの上端
    viewMatrix.setMaxScreenRect(
        LAppDefine.VIEW_LOGICAL_MAX_LEFT,
        LAppDefine.VIEW_LOGICAL_MAX_RIGHT,
        LAppDefine.VIEW_LOGICAL_MAX_BOTTOM,
        LAppDefine.VIEW_LOGICAL_MAX_TOP
    );

    viewMatrix.setMaxScale(LAppDefine.VIEW_MAX_SCALE);
    viewMatrix.setMinScale(LAppDefine.VIEW_MIN_SCALE);

    projMatrix = new L2DMatrix44();
    projMatrix.multScale(1, canvas.width / canvas.height);

    // マウス用スクリーン変換行列
    deviceToScreen = new L2DMatrix44();
    deviceToScreen.multTranslate(-canvas.width / 2.0, -canvas.height / 2.0);
    deviceToScreen.multScale(2 / canvas.width, -2 / canvas.width);

    gl.viewport(0, 0, canvas.width, canvas.height);
};

viewer.initL2dCanvas = function (canvasId) {
    // canvasオブジェクトを取得
    canvas = document.getElementById(canvasId);

    // イベントの登録
    if (canvas.addEventListener) {
        canvas.addEventListener("mousewheel", mouseEvent, false);
        canvas.addEventListener("click", mouseEvent, false);

        canvas.addEventListener("mousedown", mouseEvent, false);
        canvas.addEventListener("mousemove", mouseEvent, false);

        canvas.addEventListener("mouseup", mouseEvent, false);
        canvas.addEventListener("mouseout", mouseEvent, false);
        canvas.addEventListener("contextmenu", mouseEvent, false);

        // タッチイベントに対応
        canvas.addEventListener("touchstart", touchEvent, false);
        canvas.addEventListener("touchend", touchEvent, false);
        canvas.addEventListener("touchmove", touchEvent, false);
    }
};

viewer.init = function () {
    // Initialize UI components
    btnPrev = document.getElementById("btnPrev");
    btnNext = document.getElementById("btnNext");
    btnPrev.addEventListener("click", function (e) {
        viewer.changeModel(-1);
    });
    btnNext.addEventListener("click", function (e) {
        viewer.changeModel(1);
    });

    btnGoto = document.getElementById("btnGoto");
    btnGoto.addEventListener("click", function (e) {
        viewer.goto();
    });

    btnPlayPause = document.getElementById("btnPlayPause");
    btnPlayPause.addEventListener("click", function (e) {
        viewer.togglePlayPause();
    });
    btnPlayPause.textContent = isPlay ? "Pause" : "Play";

    btnSave = document.getElementById("btnSave");
    btnSave.addEventListener("click", function (e) {
        viewer.save();
    });

    btnSaveLayer = document.getElementById("btnSaveLayer");
    btnSaveLayer.addEventListener("click", function (e) {
        viewer.saveLayer();
    });

    btnSecret = document.getElementById("btnSecret");
    btnSecret.addEventListener("click", function (e) {
        viewer.secret();
    });

    btnBatch = document.getElementById("btnBatch");
    btnBatch.addEventListener("click", function (e) {
        viewer.batch();
    });

    btnResize = document.getElementById("btnResize");
    btnResize.addEventListener("click", function (e) {
        viewer.resize();
    });

    btnLookRandom = document.getElementById("btnLookRandom");
    btnLookRandom.addEventListener("click", function (e) {
        isLookRandom = !isLookRandom;
    });

    btnPrevMotion = document.getElementById("btnPrevMotion");
    btnPrevMotion.addEventListener("click", function (e) {
        live2DMgr.prevIdleMotion();
    });
    btnNextMotion = document.getElementById("btnNextMotion");
    btnNextMotion.addEventListener("click", function (e) {
        live2DMgr.nextIdleMotion();
    });

    // Load all models
    let filelist = [];
    walkdir(datasetRoot, function (filepath) {
        filelist.push(filepath);
    });
    live2DMgr.setModelJsonList(loadModel(filelist));

    // 3Dバッファの初期化
    var width = canvas.width;
    var height = canvas.height;

    dragMgr = new L2DTargetPoint();

    // ビュー行列
    var ratio = height / width;
    var left = LAppDefine.VIEW_LOGICAL_LEFT;
    var right = LAppDefine.VIEW_LOGICAL_RIGHT;
    var bottom = -ratio;
    var top = ratio;

    viewMatrix = new L2DViewMatrix();

    // デバイスに対応する画面の範囲。 Xの左端, Xの右端, Yの下端, Yの上端
    viewMatrix.setScreenRect(left, right, bottom, top);

    // デバイスに対応する画面の範囲。 Xの左端, Xの右端, Yの下端, Yの上端
    viewMatrix.setMaxScreenRect(
        LAppDefine.VIEW_LOGICAL_MAX_LEFT,
        LAppDefine.VIEW_LOGICAL_MAX_RIGHT,
        LAppDefine.VIEW_LOGICAL_MAX_BOTTOM,
        LAppDefine.VIEW_LOGICAL_MAX_TOP
    );

    viewMatrix.setMaxScale(LAppDefine.VIEW_MAX_SCALE);
    viewMatrix.setMinScale(LAppDefine.VIEW_MIN_SCALE);

    projMatrix = new L2DMatrix44();
    projMatrix.multScale(1, width / height);

    // マウス用スクリーン変換行列
    deviceToScreen = new L2DMatrix44();
    deviceToScreen.multTranslate(-width / 2.0, -height / 2.0);
    deviceToScreen.multScale(2 / width, -2 / width);

    // WebGLのコンテキストを取得する
    gl = getWebGLContext();
    if (!gl) {
        l2dError("Failed to create WebGL context.");
        return;
    }
    // OpenGLのコンテキストをセット
    Live2D.setGL(gl);

    // 描画エリアを白でクリア
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    // Call changeModel once to initialize
    viewer.changeModel(0);

    viewer.startDraw();
};

viewer.startDraw = function () {
    if (!isDrawStart) {
        isDrawStart = true;

        function tick() {
            if (isPlay) {
                viewer.draw(); // 1回分描画
            }
            // requestAnimationFrame은 비동기적으로 다음 화면 그리기 작업을 예약합니다.
            // 브라우저의 화면 리플레시 주기에 맞춰 호출되며, 대부분의 경우 60Hz(초당 60번)로 호출됩니다. 
            // 즉, 약 16.7ms 간격으로 실행됩니다.
            requestAnimationFrame(tick); // 다음 프레임 요청
        }

        tick(); // 애니메이션 루프 시작
    }
};

viewer.draw = function () {
    // l2dLog("--> draw()");
    // viewer.resize();

    MatrixStack.reset();
    MatrixStack.loadIdentity();

    if (frameCount % 30 == 0) {
        lookRandom();
    }

    dragMgr.update(); // ドラッグ用パラメータの更新

    // Note: face direction, top-left (-1,1), top-right (1,1), bottom-left (-1,-1), bottom-right (1,-1)
    // dragMgr.setPoint(1, 1); // その方向を向く

    live2DMgr.setDrag(dragMgr.getX(), dragMgr.getY());

    // Canvasをクリアする
    gl.clear(gl.COLOR_BUFFER_BIT);

    MatrixStack.multMatrix(projMatrix.getArray());
    MatrixStack.multMatrix(viewMatrix.getArray());
    MatrixStack.push();

    for (var i = 0; i < live2DMgr.numModels(); i++) {
        var model = live2DMgr.getModel(i);

        if (model == null) return;

        if (model.initialized && !model.updating) {
            model.update(frameCount);
            model.draw(gl);

            if (!isModelShown && i == live2DMgr.numModels() - 1) {
                isModelShown = !isModelShown;
                var btnPrev = document.getElementById("btnPrev");
                btnPrev.removeAttribute("disabled");
                btnPrev.setAttribute("class", "active");

                var btnNext = document.getElementById("btnNext");
                btnNext.removeAttribute("disabled");
                btnNext.setAttribute("class", "active");
            }
        }
    }

    MatrixStack.pop();

    if (isPlay) {
        frameCount++;
    }
};

viewer.changeModel = function (inc = 1) {
    btnPrev = document.getElementById("btnPrev");
    btnPrev.setAttribute("disabled", "disabled");
    btnPrev.setAttribute("class", "inactive");

    btnNext = document.getElementById("btnNext");
    btnNext.setAttribute("disabled", "disabled");
    btnNext.setAttribute("class", "inactive");

    isModelShown = false;

    live2DMgr.reloadFlg = true;
    live2DMgr.count += inc;

    txtInfo = document.getElementById("txtInfo");

    var count = live2DMgr.getCount();
    var curModelPath = live2DMgr.modelJsonList[count];
    txtInfo.textContent =
        "[" +
        (count + 1) +
        "/" +
        live2DMgr.modelJsonList.length +
        "] " +
        curModelPath;
    console.log("[curModelPath]", curModelPath);
    // console.log("[MD5]", curModelPath);
    live2DMgr.changeModel(gl, viewer.resize);
};

viewer.flagBlacklist = function () {
    var count = live2DMgr.getCount();
    var curModelPath = live2DMgr.modelJsonList[count];
    relativeCurModelPath = curModelPath.slice(datasetRoot.length + 1); // Include the '/'
    fs.appendFileSync(blacklistPath, relativeCurModelPath + "\n");
    console.log("[flagBlacklist]", "Flagged " + relativeCurModelPath);
};

function prettyPrintEveryJson() {
    walkdir(datasetRoot, (file) => {
        if (file.endsWith(".json")) {
            j = fs.readFileSync(file).toString();
            try {
                fs.writeFileSync(file, JSON.stringify(JSON.parse(j), null, 3));
            } catch (error) {
                console.error("JSON Parse Error", file);
            }
        }
    });
}

function md5file(filePath) {
    const target = fs.readFileSync(filePath);
    const md5hash = crypto.createHash("md5");
    md5hash.update(target);
    return md5hash.digest("hex");
}

function loadModel(filelist) {
    let modelJsonList = [];
    filelist.forEach((filepath) => {
        if (filepath.endsWith(".moc")) {
            modelJson = loadModelJson(filepath);
            if (modelJson) {
                modelJsonList.push(...modelJson);
            }
        }
    });
    modelJsonList = [...new Set(modelJsonList)];
    modelJsonList.forEach((value, index) => {
        modelJsonIds[value] = index;
    });
    // Filter out the blacklisted models
    modelJsonList = modelJsonList.filter(function (e) {
        return this.indexOf(e) < 0;
    }, this.blacklist);
    console.log("[loadModel]", modelJsonList.length + " model loaded");
    return modelJsonList;
}

function loadModelJson(mocPath) {
    pardir = path.dirname(mocPath);
    let textures = []; // *.png
    let physics; // *.physics or physics.json
    let pose; // pose.json
    let expressions = []; // *.exp.json
    let motions = []; // *.mtn
    let modelJson = [];
    walkdir(pardir, function (filepath) {
        if (filepath.endsWith(".png")) {
            textures.push(filepath.replace(pardir + "/", ""));
        }
        if (
            filepath.endsWith(".physics") ||
            filepath.endsWith("physics.json")
        ) {
            physics = filepath.replace(pardir + "/", "");
        }
        if (filepath.endsWith("pose.json")) {
            pose = filepath.replace(pardir + "/", "");
        }
        if (filepath.endsWith(".mtn")) {
            motions.push(filepath.replace(pardir + "/", ""));
        }
        if (filepath.endsWith(".exp.json")) {
            expressions.push(filepath.replace(pardir + "/", ""));
        }
        if (filepath.endsWith("generated.model.json")) {
            if (!ignoreGeneratedJson) {
                modelJson.push(filepath);
            }
        } else if (filepath.endsWith("model.json")) {
            if (!ignoreOriginalJson) {
                modelJson.push(filepath);
            }
        }
    });
    // Generate a JSON file based on all the resources we can find
    if (modelJson.length == 0) {
        if (textures.length == 0) {
            console.warn(
                "[loadModelJson]",
                "0 texture found! .moc path: " + mocPath
            );
            // Usually is a corrupted model, ignore
            return;
        }
        textures.sort();
        motions.sort();
        var model = {};
        model["version"] = "AutoGenerated 1.0.0";
        model["model"] = mocPath.replace(pardir + "/", "");
        model["textures"] = textures;
        if (physics) model["physics"] = physics;
        if (pose) model["pose"] = pose;
        if (expressions.length > 0) {
            model["expressions"] = [];
            expressions.forEach((expression) => {
                model["expressions"].push({
                    file: expression,
                    name: path.basename(expression),
                });
            });
        }
        if (motions.length > 0) {
            model["motions"] = { idle: [] };
            motions.forEach((motion) => {
                model["motions"]["idle"].push({ file: motion });
            });
        }
        json = JSON.stringify(model, null, 3);
        generatedJsonPath = path.join(pardir, "generated.model.json");
        modelJson.push(generatedJsonPath);
        fs.writeFileSync(generatedJsonPath, json);
    }
    return modelJson;
}

function walkdir(dir, callback) {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
        var filepath = path.join(dir, file);
        const stats = fs.statSync(filepath);
        if (stats.isDirectory()) {
            walkdir(filepath, callback);
        } else if (stats.isFile()) {
            callback(filepath);
        }
    });
}

/* ********** マウスイベント ********** */

/*
 * マウスホイールによる拡大縮小
 */
function modelScaling(scale) {
    var isMaxScale = thisRef.viewMatrix.isMaxScale();
    var isMinScale = thisRef.viewMatrix.isMinScale();

    thisRef.viewMatrix.adjustScale(0, 0, scale);

    // 画面が最大になったときのイベント
    if (!isMaxScale) {
        if (thisRef.viewMatrix.isMaxScale()) {
            thisRef.live2DMgr.maxScaleEvent();
        }
    }
    // 画面が最小になったときのイベント
    if (!isMinScale) {
        if (thisRef.viewMatrix.isMinScale()) {
            thisRef.live2DMgr.minScaleEvent();
        }
    }
}

// 📏 캔버스 스케일링 보정 함수
function getScaledCoordinates(event, target) {
    var rect = target.getBoundingClientRect();

    // 렌더링 크기 대비 캔버스 해상도 비율
    var scaleX = target.width / rect.width;
    var scaleY = target.height / rect.height;

    // 보정된 좌표 반환
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

/*
 * クリックされた方向を向く
 * タップされた場所に応じてモーションを再生
 */
function modelTurnHead(event) {
    thisRef.drag = true;

    // 보정된 좌표 가져오기
    var scaledCoords = getScaledCoordinates(event, event.target);

    // 좌표 변환
    var sx = transformScreenX(scaledCoords.x);
    var sy = transformScreenY(scaledCoords.y);
    var vx = transformViewX(scaledCoords.x);
    var vy = transformViewY(scaledCoords.y);

    if (LAppDefine.DEBUG_MOUSE_LOG)
        l2dLog(
            "onMouseDown device( x:" +
                event.clientX +
                " y:" +
                event.clientY +
                " ) view( x:" +
                vx +
                " y:" +
                vy +
                ")"
        );

    thisRef.lastMouseX = sx;
    thisRef.lastMouseY = sy;

    thisRef.dragMgr.setPoint(vx, vy); // その方向を向く

    // タップした場所に応じてモーションを再生
    thisRef.live2DMgr.tapEvent(vx, vy);
}

/*
 * マウスを動かした時のイベント
 */
function followPointer(event) {
    // 보정된 좌표 가져오기
    var scaledCoords = getScaledCoordinates(event, event.target);

    // 좌표 변환
    var sx = transformScreenX(scaledCoords.x);
    var sy = transformScreenY(scaledCoords.y);
    var vx = transformViewX(scaledCoords.x);
    var vy = transformViewY(scaledCoords.y);

    if (LAppDefine.DEBUG_MOUSE_LOG)
        l2dLog(
            "onMouseMove device( x:" +
                event.clientX +
                " y:" +
                event.clientY +
                " ) view( x:" +
                vx +
                " y:" +
                vy +
                ")"
        );

    if (thisRef.drag) {
        thisRef.lastMouseX = sx;
        thisRef.lastMouseY = sy;

        thisRef.dragMgr.setPoint(vx, vy); // その方向を向く
    }
}

/*
 * 正面を向く
 */
function lookFront() {
    if (thisRef.drag) {
        thisRef.drag = false;
    }

    thisRef.dragMgr.setPoint(0, 0);
}

function lookRandom() {
    if (thisRef.isLookRandom) {
        sx = Math.random() * 2.0 - 1.0;
        sy = Math.random() * 2.0 - 1.0;
        thisRef.dragMgr.setPoint(sx, sy);
        console.log("[lookRandom]", sx, sy);
    }
}

function isInCanvasArea(e) {
    var rect = thisRef.canvas.getBoundingClientRect();  // 캔버스의 위치와 크기 정보 가져오기

    // 터치나 마우스 좌표가 캔버스 영역 내에 있는지 확인
    if (
        e.clientX < rect.left ||          // 좌측 바깥
        e.clientX > rect.right ||         // 우측 바깥
        e.clientY < rect.top ||           // 상단 바깥
        e.clientY > rect.bottom          // 하단 바깥
    ) {
        return false;
    }
    return true;
}

function mouseEvent(e) {
    if (!isInCanvasArea(e)) {
        return;
    }

    e.preventDefault();
    
    if (e.type == "mousewheel") {
        if (e.wheelDelta > 0) modelScaling(1.1);
        // 上方向スクロール 拡大
        else modelScaling(0.9); // 下方向スクロール 縮小
    } else if (e.type == "mousedown") {
        // 右クリック以外なら処理を抜ける
        if ("button" in e && e.button != 0) return;

        modelTurnHead(e);
    } else if (e.type == "mousemove") {
        followPointer(e);
    } else if (e.type == "mouseup") {
        // 右クリック以外なら処理を抜ける
        if ("button" in e && e.button != 0) return;

        lookFront();
    } else if (e.type == "mouseout") {
        lookFront();
    }
}

function touchEvent(e) {
    if (!isInCanvasArea(e)) {
        return;
    }
    
    e.preventDefault();

    var touch = e.touches[0];

    if (e.type == "touchstart") {
        if (e.touches.length == 1) {
            modelTurnHead(touch);
        }
    } else if (e.type == "touchmove") {
        followPointer(touch);

        if (e.touches.length == 2) {
            var touch1 = e.touches[0];
            var touch2 = e.touches[1];

            var len =
                Math.pow(touch1.pageX - touch2.pageX, 2) +
                Math.pow(touch1.pageY - touch2.pageY, 2);
            if (thisRef.oldLen - len < 0) modelScaling(1.025);
            // 上方向スクロール 拡大
            else modelScaling(0.975); // 下方向スクロール 縮小

            thisRef.oldLen = len;
        }
    } else if (e.type == "touchend") {
        lookFront();
    }
}

/* ********** マトリックス操作 ********** */
// 디바이스 입력 좌표를 뷰 좌표 시스템에 맞게 변환하여 화면상에서의 최종 위치를 계산.
//  디바이스 좌표: 사용자 입력이 터치스크린에서 발생한 좌표
//  화면 좌표: 디바이스의 물리적 해상도에 맞춰 변환된 좌표
//  뷰 좌표: 뷰 행렬에 의해 확대/축소, 이동 등의 변환이 적용된 좌표
function transformViewX(deviceX) {
    var screenX = this.deviceToScreen.transformX(deviceX); // 論理座標変換した座標を取得。
    return viewMatrix.invertTransformX(screenX); // 拡大、縮小、移動後の値。
}

function transformViewY(deviceY) {
    var screenY = this.deviceToScreen.transformY(deviceY); // 論理座標変換した座標を取得。
    return viewMatrix.invertTransformY(screenY); // 拡大、縮小、移動後の値。
}

function transformScreenX(deviceX) {
    return this.deviceToScreen.transformX(deviceX);
}

function transformScreenY(deviceY) {
    return this.deviceToScreen.transformY(deviceY);
}

/*
 * WebGLのコンテキストを取得する
 */
function getWebGLContext() {
    var NAMES = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];

    for (var i = 0; i < NAMES.length; i++) {
        try {
            var ctx = this.canvas.getContext(NAMES[i], {
                premultipliedAlpha: true,
                preserveDrawingBuffer: true,
            });
            if (ctx) return ctx;
        } catch (e) {}
    }
    return null;
}

/*
 * 画面エラーを出力
 */
function l2dError(msg) {
    if (!LAppDefine.DEBUG_LOG) return;
    console.error(msg);
}
