from flask import Flask, render_template

landing_app = Flask(__name__)

@landing_app.route('/')
def landing_page():
    return render_template('landing_page.html')

@landing_app.route('/biomechanics')
def biomechanics_page():
    return render_template('index.html')

if __name__ == '__main__':
    landing_app.run(debug=True, port=5000)