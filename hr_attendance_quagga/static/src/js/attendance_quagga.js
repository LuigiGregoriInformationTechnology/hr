odoo.define('hr_attendance_quagga.attendance_quagga', function (require) {
    "use strict";

    var core = require('web.core');
    var _t = core._t;
    var session = require('web.session');
    var KioskMode = require('hr_attendance.kiosk_mode');

    KioskMode.include({
        events: _.defaults({
            'click #btn-start': '_createWidget',
            'click #btn-stop': '_destroyWidget',
        }, KioskMode.prototype.events),

        _container: null,
        _btn_start: null,
        _btn_stop: null,
        _audio: null,

        _enabled: false,

        _html5qrcode: null,
        _cameraId: null,

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

        _createWidget: function () {
            // unfortunately this does not work in start() after calling super
            this._html5qrcode = new Html5Qrcode('scanner-container', false);
            this._container = this.$('#scanner-container');
            this._btn_start = this.$('#btn-start');
            this._btn_stop = this.$('#btn-stop');
            this._audio = this.$('#audio').get(0);
            this._selectDevice();
        },

        _destroyWidget: function () {
            this._stopScanner();
            this._btn_start.delay(500).fadeIn(500);
            this._btn_stop.fadeOut(500);
        },

        _startScanner: function () {
            if (this._cameraId === null) {
                console.error('cameraId is null!');
                return;
            }

            this._html5qrcode.start(this._cameraId,
                {
                    fps: 10,
                    qrbox: 250,
                },
                (qrCodeMessage) => {
                    console.log(`QR Code detected: ${qrCodeMessage}`);
                    if (this._enabled) {
                        this._attendance_scan(qrCodeMessage);
                    }
                },
                () => undefined
            ).catch((err) => {
                console.log(`Unable to start scanning, error: ${err}`);
            });
        },

        _stopScanner: function () {
            this._html5qrcode.stop().then(() => {
                console.log('QR Code scanning stopped.');
            }).catch((err) => {
                console.log(`Unable to stop scanning: ${err}`);
            });
        },

        _attendance_scan: function (code) {
            this._audio.play();

            this._rpc({
                model: 'hr.employee',
                method: 'attendance_scan',
                args: [code],
            }).then((scanres) => {
                if (scanres.action) {
                    // let the sound play
                    setTimeout(() => {
                        this._destroyWidget();
                        this.do_action(scanres.action);
                    }, 500);
                } else if (scanres.warning) {
                    this.do_warn(scanres.warning);
                    this._pauseFor(5000);
                }
            }).fail((reason) => {
                // the web client loses odoo connection
                // TODO: any way to check when odoo reconnects back?
                console.error(reason);
                this._pauseFor(5000);
            });
        },

        _pauseFor: function (duration) {
            this._enabled = false;
            setTimeout(() => {
                this._enabled = true;
            }, duration);
        },

        _startWithDevice: function (cameraId) {
            this._container.empty();
            this._btn_stop.delay(500).fadeIn(500);
            this._btn_start.fadeOut(500);
            this._cameraId = cameraId;
            this._enabled = true;
            this._startScanner();
        },

        _selectDevice: function () {
            // this method will trigger user permissions
            Html5Qrcode.getCameras().then((results) => {
                // my firefox returns duplicated camera device
                var devices = _.uniq(results, false, function (device) {
                    return device.id;
                });

                // no selection for single device
                if (devices.length === 1) {
                    this._startWithDevice(devices[0].id);
                    return;
                }

                var deviceSelection = document.createElement('select');
                var option = document.createElement('option');
                option.selected = true;
                option.appendChild(document.createTextNode(
                    _t('Select camera device')));
                deviceSelection.appendChild(option);

                devices.forEach((device) => {
                    option = document.createElement('option');
                    option.value = device.id;
                    var text = device.label
                        ? device.label.substr(0, 30) : device.id;
                    option.appendChild(document.createTextNode(text));
                    deviceSelection.appendChild(option);
                });

                this._container.empty();
                this._container.append(deviceSelection);

                deviceSelection = $(deviceSelection);
                deviceSelection.change(() => {
                    this._startWithDevice(deviceSelection.val());
                });
            }).catch((err) => {
                console.error(err);
            });
        },
    });
});
