from datetime import datetime, timedelta
from odoo import models, fields, api, _


class Employee(models.Model):
    _inherit = 'hr.employee'

    @api.model
    def attendance_scan(self, barcode):
        """ Receive a barcode scanned from the Kiosk Mode and change the
            attendances of corresponding employee.
            Returns either an action or a warning.
        """

        employee = self.search([('barcode', '=', barcode)], limit=1)

        if not employee:
            return {'warning': _(
                'No employee corresponding to barcode %(barcode)s') % {
                    'barcode': barcode}}

        # prevent duplicate
        check_time = fields.Datetime.to_string(
            datetime.now() - timedelta(seconds=60))

        attendances = self.env['hr.attendance'].search(
            [('check_in', '>=', check_time),
             ('employee_id', '=', employee.id)])

        if attendances:
            return {'warning': _(
                'You can scan a badge only one time per 60 seconds.')}

        # check for duplicates
        attendances = self.env['hr.attendance'].search(
            [('check_out', '>=', check_time),
             ('employee_id', '=', employee.id)])

        if attendances:
            return {'warning': _(
                'You can scan a badge only one time per 60 seconds.')}

        return employee.attendance_action(
            'hr_attendance.hr_attendance_action_kiosk_mode')
