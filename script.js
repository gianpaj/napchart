// Dependencies
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mysql = require('mysql');
var favicon = require('serve-favicon');
var winston = require('winston');
var nconf = require('nconf');


nconf.argv()
  .file({ file: 'config.json' });;

if(nconf.get('setup')){
	setup();
}else if(!nconf.get('mysql')){
	winston.error('No mysql credentials found');
	winston.info('Please run node script --setup');

	process.exit();
}else{
	start();
}

function setup() {
	var install = require('./install.js')
	
	install.setup(function(credentials){

		install.mysql(credentials,function(){

			process.exit();
		})
	});
}

function start(){
	var credentials = nconf.get('mysql');
	console.log(credentials);

	var connection = mysql.createConnection(credentials);

	connection.connect(function(err) {
		if (err) {
			console.error('### error connecting to mysql server: ' + err.stack);
			return;
		}
		console.log('connected as id ' + connection.threadId);
	});


	var ipFunctions = {
		dot2num:function(dot){
			var d = dot.split('.');
			return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
		},

		num2dot:function(num){
			var d = num%256;
			for (var i = 3; i > 0; i--) 
			{ 
				num = Math.floor(num/256);
				d = num%256 + '.' + d;
			}
			return d;
		}
	}

	function visit(chartid){

		connection.query('UPDATE chart SET visits=visits+1 WHERE chartid=?',chartid,function(err){
			if(err)
				throw err;

			return true;
		})
	}

	function getObject(chartid,callback){
		connection.query('SELECT type,text,start,end FROM chartitem WHERE chartid = ?',chartid, function(err,rows){
			if(err){
				console.error('################################# ERROR ');
				console.log(err);
				throw err;
			}

			var output;
			var codes = {
				0:'core',
				1:'nap',
				2:'busy'
			}

			output = {
				core:[],
				nap:[],
				busy:[]
			};

			if(rows.length == 0){
				var none = true;
			}else{
				var none = false;
			}

			for(var i = 0; i < rows.length; i++){

				output[codes[rows[i].type]].push({
					start:rows[i].start,
					end:rows[i].end
				});
			};

			visit(chartid);

			console.log(output);
			return callback(output,none);
		});
	}

	app.use(express.static('public'));
	app.use(favicon(__dirname + '/public/img/favicon.ico')); //serve favicon
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({
		extended: true
	}));

	app.set('view engine', 'ejs');

	//Routes:

	//index
	app.get('/', function (req, res) {
		var host = req.headers.host;

		res.render('pages/main',{chartid:null,chart:null, url:host});
	});

	//chart
	app.get('/:chartid', function (req, res) {
		var chartid = req.params.chartid;
		var host = req.headers.host;

		getObject(chartid, function(object,none){
			if(none){
				res.redirect('/');
			}
			res.render('pages/main',{chartid:chartid,chart:JSON.stringify(object), url:host});
		});
	});

	//get schedule data
	app.get('/get/:chartid', function(req, res) {
		var chartid = req.params.chartid;

		getObject(chartid,function(object){

			res.writeHead(200, {"Content-Type": "application/json"});
			res.end(JSON.stringify(output));

		});
	});

	//save schedule
	app.post('/post', function (req, res) {

		function idgen(){
			alphabet = "abcdefghijklmnopqrstuwxyz0123456789";
			id='';
			for( var i=0; i < 5; i++ )
				id += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
			return id;
		}

		chartid=idgen();

		var chartid, chartinfo, chartitem;
		var data = JSON.parse(req.body.data);
		//first add chartid in chart
		function setChartID(){
			var chartid = idgen();

			connection.query('SELECT chartid FROM chart WHERE chartid=?', chartid, function(err,res){
				if(err){
					console.error('### ERROR ', err);
					throw err;
				}
				if(res.length > 0){
		      	//try new one
		      	setChartID();
		      }
		      console.log('We found ',chartid)
		      console.log('Last insert ID:', res.insertId);
		  });

			return chartid;
		}
		
		var ip = req.headers['x-forwarded-for'] || 
		req.connection.remoteAddress || 
		req.socket.remoteAddress ||
		req.connection.socket.remoteAddress;

		var numIp = ipFunctions.dot2num(ip);

		chartid = setChartID();
		chartinfo = {
			chartid:chartid,
			visits:0,
			ip:numIp
		}

		connection.query('INSERT INTO chart SET ?', chartinfo, function(err,res){
			if(err) throw err;
			console.log('chartinfo: Last insert ID:', res.insertId);
		});

		var codes = {
			'core':0,
			'nap':1,
			'busy':2
		}

		var text;
		Object.keys(data).forEach(function(name) {
			for(var i = 0; i < data[name].length; i++){
				var text = data[name][i].text || '';
				chartitem = {
					chartid:chartid,
					type:codes[name],
					start:data[name][i].start,
					end:data[name][i].end,
					text:text
				};
				connection.query('INSERT INTO chartitem SET ?', chartitem, function(err,res){
					if(err) throw err;

					console.log('chartitem: Last insert ID:', res.insertId);
				});
			}
		});

		res.writeHead(200);
		res.end(chartid);
	});

	app.post('/email-feedback-post', function (req,res){
		var text = req.body.message;
		var feedback = {
			text: text
		}

		//post to database
		connection.query('INSERT INTO feedback SET ?', feedback, function(err,res){
			if(err) throw err;

			console.log('feedback: Last insert ID:', res.insertId);
		});

		res.writeHead(200);
		res.end('success');
	});

	app.get('*', function (req, res) {
		res.redirect('/');
	});


	var server_port = process.env.OPENSHIFT_NODEJS_PORT || 3000
	var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1'

	var server = app.listen(server_port,server_ip_address);
}