{
    'name': "HR Attendance Quagga",
    'summary': """Attendance with Quaggajs""",
    'author': "Netfarm S.r.l,Odoo Community Association (OCA)",
    'website': "https://github.com/OCA/hr",
    'category': 'Human Resources',
    'version': '11.0.1.0.0',
    'license': 'AGPL-3',
    'depends': ['base', 'hr_attendance'],
    'data': [
        'views/assets.xml',
    ],
    'qweb': [
        'static/src/xml/template.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': True,
}
