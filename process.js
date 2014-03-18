/**
* Module dependencies.
*/
var _ 			= require('underscore');
var Twig 		= require("twig");
var express 	= require('express');
var http 		= require('http');
var path 		= require('path');
var Gamify 		= require("Gamify.io");
var _os			= require('os');
var toolset		= require('toolset');
var mime 		= require('mime');

var options = _.extend({
	online:			true,
	env:			"dev",
	debug_mode:		false,
	port:			80
},processArgs());

options.threads			= Math.min(options.threads, _os.cpus().length);
options.cores 			= _os.cpus().length;

var app = express();

// all environments
app.set('env', options.env);
app.set('views', __dirname + 'templates');
app.set('view engine', 'twig');
app.set('view cache', false);
app.disable('view cache');
app.set("twig options", {
	strict_variables: false
});
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);

// development only
if ('dev' == app.get('env')) {
	app.use(express.errorHandler());
}

toolset.file.toObject('settings.json', function(settings) {
	options.settings 	= settings;
	options.serve 		= settings.webdir;
	options.port 		= settings.port;
	
	app.set('port', process.env.PORT || options.port);
	
	http.createServer(app).listen(app.get('port'), function(){
		console.log('S3 server listening on port ' + app.get('port'));
	});
});


var routeRequest = function(req, res) {
	var filename = options.serve+req.url;
	//Check if the file exists
	toolset.file.exists(filename, function(exists) {
		if (exists) {
			if (toolset.file.isDir(filename)) {
				// Check if there is an index file
				var opStack = new toolset.stack();
				var found = false;
				
				_.each(options.settings.index, function(file) {
					opStack.add(function(p, cb) {
						if (found === false) {
							toolset.file.exists(filename+'/'+p.file, function(exists) {
								if (exists) {
									found = filename+'/'+p.file;
								}
								cb();
							});
						} else {
							// index file already found, skip
							cb();
						}
						
					},{file:file});
				});
				
				opStack.process(function() {
					if (found === false) {
						// no index file found
						if (options.settings.listFiles) {
							// List the files and directories
							toolset.file.getDirContent(filename, function(content) {
								res.set("Content-Type", "application/json");
								res.send(200, JSON.stringify(content, null, 4));
							});
						} else {
							res.set("Content-Type", "application/json");
							res.send(403, JSON.stringify({
								message:	"Permission denied."
							}, null, 4));
						}
					} else {
						// index file found
						toolset.file.read(found, function(content) {
							res.set("Content-Type", mime.lookup(found));
							res.send(200, content);
						});
					}
				}, false);	// sync
				
				
			} else {
				toolset.file.read(filename, function(content) {
					res.set("Content-Type", mime.lookup(filename));
					res.send(200, content);
				});
			}
		} else {
			res.set("Content-Type", "application/json");
			res.send(404, JSON.stringify({
				message:	"The file \""+filename+"\" doesn't exist."
			}, null, 4));
		}
	});
}


app.get("/version", function(req, res){
	res.set("Content-Type", "application/json");
	res.send(200, JSON.stringify({
		name:		"S3 Static Server",
		version:	Gamify.version
	}, null, 4));
});
app.get("*", function(req, res){
	routeRequest(req, res);
});
app.get("/icanhasoptionz", function(req, res){
	res.set("Content-Type", "application/json");
	res.send(200, JSON.stringify({
		name:		"AIStock API Server",
		version:	Gamify.version,
		db:			Gamify.settings.db,
		options:	_.extend(options, {
			mongo_server:	"nope nope nope",
			mongo_login:	"nope nope nope",
			mongo_password:	"nope nope nope"
		}),
		endpoints:	Gamify.api.endpoints
	}, null, 4));
});
function processArgs() {
	var i;
	var args 	= process.argv.slice(2);
	var output 	= {};
	for (i=0;i<args.length;i++) {
		var l1	= args[i].substr(0,1);
		if (l1 == "-") {
			if (args[i+1] == "true") {
				args[i+1] = true;
			}
			if (args[i+1] == "false") {
				args[i+1] = false;
			}
			if (!isNaN(args[i+1]*1)) {
				args[i+1] = args[i+1]*1;
			}
			output[args[i].substr(1)] = args[i+1];
			i++;
		}
	}
	return output;
};

/************************************/
/************************************/
/************************************/
// Process Monitoring
setInterval(function() {
	process.send({
		memory:		process.memoryUsage(),
		process:	process.pid
	});
}, 1000);

// Crash Management
if (!options.debug_mode) {
	process.on('uncaughtException', function(err) {
		console.log("err",err);
		//global.monitor.log("Stats.error", err.stack);
	});
}