//
//  Copyright (c) 2014 Sam Leitch. All rights reserved.
//
//  Permission is hereby granted, free of charge, to any person obtaining a copy
//  of this software and associated documentation files (the "Software"), to
//  deal in the Software without restriction, including without limitation the
//  rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
//  sell copies of the Software, and to permit persons to whom the Software is
//  furnished to do so, subject to the following conditions:
//
//  The above copyright notice and this permission notice shall be included in
//  all copies or substantial portions of the Software.
//
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
//  IN THE SOFTWARE.
//


/**
 * This class grabs content from a video element and feeds it to a canvas element.
 * The content is modified using a custom WebGL shader program.
 */
function WebGLVideoTest(canvas, video) {
    this.canvas = canvas;
    this.video = video;
}

/**
 * Setup the WebGL context and start rendering content.
 */
WebGLVideoTest.prototype.start = function() {
    this.initGlContext();
    this.initProgram();
    this.initBuffers();
    this.initTextures();
    this.startDrawing();
}

/**
 * Create the GL context from the canvas element
 */
WebGLVideoTest.prototype.initGlContext = function() {
    var canvas = this.canvas;
    var gl;

    try {
        gl = canvas.getContext('experimental-webgl');
    } catch (e) {
        alert('Couldn\'t create gl context, sorry :(', e);
    }

    this.gl = gl;
}

/**
 * Initialize GL shader program
 */
WebGLVideoTest.prototype.initProgram = function() {
    var gl = this.gl;

    var vertexShaderScript = [
        'attribute vec4 vertexPos;',
        'attribute vec4 texturePos;',
        'varying vec2 textureCoord;',

        'void main()',
        '{',
            'gl_Position = vertexPos;',
            'textureCoord = texturePos.xy;',
        '}'].join('\n');

    var fragmentShaderScript = [
        'varying highp vec2 textureCoord;',
        'uniform highp float colorShift;',
        'uniform sampler2D video;',

        'void main()',
        '{',
            'highp float b = colorShift;', 
            'highp vec4 highlightColor = vec4(textureCoord.r, textureCoord.g, b, 0.2);',
            'highp vec4 videoColor = texture2D(video, textureCoord);',
            'gl_FragColor = vec4(highlightColor.a) * highlightColor + vec4(1.0 - highlightColor.a) * videoColor;',
        '}'].join('\n');

    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderScript);
    gl.compileShader(vertexShader);
    if(!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        alert('Vertex shader failed to compile: ' + gl.getShaderInfoLog(vertexShader));
    }

    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderScript);
    gl.compileShader(fragmentShader);
    if(!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        alert('Fragment shader failed to compile: ' + gl.getShaderInfoLog(fragmentShader));
    }

    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert('Program failed to compile: ' + gl.getProgramInfoLog(program));
    }

    gl.useProgram(program);
    
    this.program = program;
}

/**
 * Initialize vertex buffers and attach to shader program
 */
WebGLVideoTest.prototype.initBuffers = function() {
    var gl = this.gl;
    var program = this.program;

    var vertexPosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]), gl.STATIC_DRAW);

    var vertexPosRef = gl.getAttribLocation(program, 'vertexPos');
    gl.enableVertexAttribArray(vertexPosRef);
    gl.vertexAttribPointer(vertexPosRef, 2, gl.FLOAT, false, 0, 0);

    var texturePosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texturePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);

    var texturePosRef = gl.getAttribLocation(program, 'texturePos');
    gl.enableVertexAttribArray(texturePosRef);
    gl.vertexAttribPointer(texturePosRef, 2, gl.FLOAT, false, 0, 0);
}

/**
 * Initialize GL textures and attach to shader program
 */
WebGLVideoTest.prototype.initTextures = function() {
    var gl = this.gl;
    var program = this.program;

    var videoTextureRef = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, videoTextureRef);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    var videoSamplerRef = gl.getUniformLocation(program, 'video');
    gl.uniform1i(videoSamplerRef, 0);

    this.videoTextureRef = videoTextureRef;
}

/**
 * Setup GL viewport and start the render loop
 */
WebGLVideoTest.prototype.startDrawing = function() {
    var gl = this.gl;
    var program = this.program;
    var canvas = this.canvas;
    var video = this.video;
    var videoTextureRef = this.videoTextureRef;

    // You can only capture from playing video
    if(video.paused) {
        video.onplay = this.startDrawing.bind(this);
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    var colorShiftRef = gl.getUniformLocation(program, 'colorShift');

    var draw = function(timestamp) {
        // Varies between 0 and 1 with a frequency of 1 Hz
        var colorShift = Math.sin(timestamp / 1000.0 * 2.0 * Math.PI) * 0.5 + 0.5;
        gl.uniform1f(colorShiftRef, colorShift);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTextureRef);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); 

        window.requestAnimationFrame(draw);
    };

    window.requestAnimationFrame(draw);
}


/**
 * Grabs video from the local video camera and displays it in the video element.
 */
function UserMediaHelper(video) {
    this.video = video;
}

/**
 * Grab a video feed and attach it to the video element
 */
UserMediaHelper.prototype.start = function() {
    var video = this.video;

    var mediaConstraints = {video: true, audio: false};

    var onUserMediaSuccess = function(stream) {
        this.attachMediaStream(video, stream);
    }.bind(this);

    var onUserMediaError = function(error) {
        alert('getUserMedia failed: ', error);
    };

    navigator.getUserMedia(mediaConstraints, onUserMediaSuccess, onUserMediaError);
}

/**
 * Polyfill to attach userMedia to video element (Borrowed from adapter.js)
 */
UserMediaHelper.prototype.attachMediaStream = function(element, stream) {
    if (typeof element.srcObject !== 'undefined') {
        element.srcObject = stream;
    } else if (typeof element.mozSrcObject !== 'undefined') {
        element.mozSrcObject = stream;
    } else if (typeof element.src !== 'undefined') {
        element.src = URL.createObjectURL(stream);
    } else {
        alert('Error attaching stream to element.');
    }
}

/**
 * Polyfill for getUserMedia
 */
navigator.getUserMedia = navigator.getUserMedia || 
                        navigator.webkitGetUserMedia || 
                        navigator.mozGetUserMedia;

/**
 * Polyfill for requestAnimationFrame
 */
window.requestAnimationFrame = window.requestAnimationFrame ||
                            window.webkitRequestAnimationFrame ||
                            window.mozRequestAnimationFrame;
