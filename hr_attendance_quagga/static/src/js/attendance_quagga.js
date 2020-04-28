odoo.define('hr_attendance_quagga.attendance_quagga', function (require) {
    "use strict";

    var session = require('web.session');
    var KioskMode = require('hr_attendance.kiosk_mode');

    KioskMode.include({
        events: _.defaults({
            'click #btn-start': 'widgetStartScanner',
            'click #btn-stop': 'widgetStopScanner',
        }, KioskMode.prototype.events),

        _container: null,
        _btn_start: null,
        _btn_stop: null,
        _audio: null,

        // Avoid being called multiple times from Quagga
        _processing: false,

        // Prevent duplicate
        _barcode: null,

        start: function () {
            // Odoo 10.0 compatibility, single codebase
            if (this._rpc === undefined) {
                this._rpc = function (params, options) {
                    var call_kw = '/web/dataset/call_kw/' +
                        params.model + '/' + params.method;
                    return session.rpc(call_kw, {
                        model: params.model,
                        method: params.method,
                        args: params.args || [],
                        kwargs: params.kwargs || {},
                    }, options);
                };
            }
            return this._super();
        },

        // Resolve overlay canvas problem
        _fixup_canvas: function () {
            var video = this._container.find('video');
            var canvas = this._container.find('canvas');

            canvas.css('position', 'absolute');
            video.css('width', '100%');
            canvas.css('width', video.width());

            var bwidth = this.$('.o_hr_attendance_kiosk_mode').outerWidth();
            var left = (bwidth - video.width()) / 2;
            canvas.css('left', left);
        },

        widgetStartScanner: function () {
            // Unfortunately this does not work in start() after calling super
            this._container = this.$('#scanner-container');
            this._btn_start = this.$('#btn-start');
            this._btn_stop = this.$('#btn-stop');
            this._audio = this.$('#audio').get(0);

            // Clear the container
            this._container.empty();

            // Start the live stream capture
            this.startScanner();
            this._btn_stop.delay(500).fadeIn(500);
            this._btn_start.fadeOut(500);

            var self = this;
            this._container.find('canvas').ready(function () {
                self._container.delay(900).slideDown(900);
                setTimeout(function () {
                    self._fixup_canvas();
                }, 905);
            });
        },

        widgetStopScanner: function () {
            Quagga.stop();
            this._btn_start.delay(500).fadeIn(500);
            this._btn_stop.fadeOut(500);
            this._container.delay(500).slideUp(900);
        },

        startScanner: function () {
            var self = this;
            Quagga.init({
                inputStream: {
                    name: 'Live',
                    type: 'LiveStream',
                    target: self._container.get(0),
                    constraints: {
                        width: 480,
                        height: 320,
                        facingMode: 'environment',
                    },
                },
                decoder: {
                    // TODO: configurable?
                    readers: [
                        'code_128_reader',
                        'ean_reader',
                        'code_39_reader',
                        'code_39_vin_reader',
                        // 'codabar_reader',
                        // 'upc_reader',
                        // 'upc_e_reader',
                        // 'i2of5_reader',
                        // '2of5_reader',
                        'code_93_reader',
                    ],
                },
                multiple: false,
                locate: true,
                numOfWorkers: 4,
            }, function (error) {
                if (error) {
                    console.error(error);
                } else {
                    Quagga.start();
                    self._fixup_canvas();
                }
            });

            Quagga.onProcessed(function (result) {
                if (!result) {
                    return;
                }

                var drawingCtx = Quagga.canvas.ctx.overlay;
                var drawingCanvas = Quagga.canvas.dom.overlay;

                if (result.boxes) {
                    var w = parseInt(drawingCanvas.getAttribute('width'), 10);
                    var h = parseInt(drawingCanvas.getAttribute('height'), 10);

                    drawingCtx.clearRect(0, 0, w, h);

                    result.boxes.filter(function (box) {
                        return box !== result.box;
                    }).forEach(function (box) {
                        Quagga.ImageDebug.drawPath(box,
                            {x: 0, y: 1},
                            drawingCtx,
                            {color: 'green', lineWidth: 2});
                    });
                }

                if (result.box) {
                    Quagga.ImageDebug.drawPath(result.box,
                        {x: 0, y: 1},
                        drawingCtx,
                        {color: 'blue', lineWidth: 2});
                }

                if (result.codeResult && result.codeResult.code) {
                    Quagga.ImageDebug.drawPath(result.line,
                        {x: 'x', y: 'y'},
                        drawingCtx,
                        {color: 'red', lineWidth: 3});
                }
            });

            Quagga.onDetected(function (result) {
                if (self._processing) {
                    return;
                }

                var code = result.codeResult.code;
                if (code === self._barcode) {
                    return;
                }

                self._barcode = code;

                self._audio.play();
                self._processing = true;

                self._rpc({
                    model: 'hr.employee',
                    method: 'attendance_scan',
                    args: [code],
                }).then(function (scanres) {
                    if (scanres.action) {
                        // Stop the scanner and live stream capture (important)
                        self.widgetStopScanner();
                        self._barcode = null;
                        self.do_action(scanres.action);
                    } else if (scanres.warning) {
                        setTimeout(function () {
                            self._barcode = null;
                        }, 5000);
                        self.do_warn(scanres.warning);
                    }
                }).fail(function (reason) {
                    // The web client loses odoo connection
                    // TODO: any way to check when odoo reconnects back?
                    self._barcode = null;
                    console.error(reason);
                }).always(function () {
                    self._processing = false;
                });
            });
        },
    });
});
