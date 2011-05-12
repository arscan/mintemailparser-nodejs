var ImapConnection = require('imap').ImapConnection,
fs = require('fs');

/* To use, do something like this:

   var MintEmailParser = require('./mintemailparser').MintEmailParser;

   mep = new MintEmailParser({
       username: 'user@xyz.com',
       password: 'pass',
       host: 'imap.gmail.com',
       port: 993,
       secure: true,
       accountnamemap: {
	       'Bank 1 - Checking-02123': 'Checking',
	       'Bank 1 - Checking': 'Checking',
	       'ING - Savings': 'ING ',
	       'ING Direct - Savings': 'ING'
	   }
   });
 
   // THIS PRINTS EVERYTHING OUT

   mep.run(function(accounts){
         console.log(accounts);
      }, function(){
         console.log("finished");
      }
   );

   // OR IF YOU JUST WANT TO SAVE TO CSV...
   mep.savetocsv(output.csv);

*/


var imap, endfn, returnfn, accountnamemap = {};

function MintEmailParser(options){

    this._options = options;
    imap = new ImapConnection({
	username: options.username,
	password: options.password,
	host: options.host,
	port: options.port,
	secure: options.secure
	    });
    accountnamemap = options.accountnamemap;
}
MintEmailParser.prototype.run = function(ret,end){
    returnfn = ret; 
    endfn = end;
    cb();    
}

MintEmailParser.prototype.savetocsv = function(outputfile){
    history = [];
    accountnames = {};

    this.run(function(accounts){
	console.log(accounts);
	history.push(accounts);
	
	
	
    }, function(){
	
	
	
	history.map(function(x){
	    x.accounts.map(function(y){
		if(y.account in accountnames)
		    accountnames[y.account]+=1;
		else
		    accountnames[y.account]=1;
	    });
	});
	var output = "Date";
	for(i in accountnames)
	    output+=","+i;
	
	for(i=0; i<history.length; i++){
	    tmpvalues={};
	    output += "\r\n";	    
	    for(j in accountnames)
		tmpvalues[j] = 0;
	    
	    for(j=0; j<history[i].accounts.length; j++)
		tmpvalues[history[i].accounts[j].account] = history[i].accounts[j].value;
	    
	    output += history[i].date;
	    for(j in tmpvalues)
		output+=","+tmpvalues[j];
	}
	
	fs.writeFile(outputfile, output, function(err) {
	    if(err) {
		console.log(err);
	    } else {
		console.log("The file was saved!");
	    }
	}); 
	
	console.log(accountnames);
    });

}

exports.MintEmailParser = MintEmailParser;

function die(err) {
    console.log('Uh oh: ' + err);
    process.exit(1);
};

// Helper function that maps to standardized account names
// Probably a cleaner way to do this...
function accountnamereplace(account){
    if(account in accountnamemap)
	return accountnamemap[account];
    return account;
}

var  box, cmds, next = 0, cb = function(err) {
    if (err)
	die(err);
    else if (next < cmds.length)
	cmds[next++].apply(this, Array.prototype.slice.call(arguments).slice(1));
};

// General structure from the imap module
cmds = [
    function() { imap.connect(cb); },
    function() { imap.openBox('INBOX', false, cb); },
    function(result) { box = result; imap.search([ ['FROM','mint'], ['SUBJECT', 'weekly'],['Since','January 20, 2008'] ], cb); },
    function(results) {
	var fetch = imap.fetch(results, { request: { body: true, headers:false} });
	fetch.on('message', function(msg) {
	    
	    var currentChunk = "";
	    msg.on('data', function(chunk) {
		currentChunk+=chunk;
	    });
	    msg.on('end', function() {
		
		if(currentChunk.match(/\%WHOLE\_BODY\%/)){
		    // Annoyingly there was a month around December 2010 in which they forgot to replace %WHOLE_BODY% with the text version.
		    // Since the HTML version changes frequently, this code will only run when this bug occured
		    // Otherwise it will parse the text version

		    returnfn({date: msg.date, accounts: currentChunk.substring(currentChunk.match(/Your Money/).index,currentChunk.match(/Top Purchases/).index).match(/ans-serif; color: #333;\">[^\$][^\$]*[^<]*/gi).map(function(x){
			return {account: accountnamereplace(x.match(/>([^<]*)/g)[2].replace(">","").trim() + " - " + x.match(/>([^<]*)/g)[0].replace(">","").trim())  ,value: x.match(/\$[0-9,\.]*/g)[0].replace(/[\$,]/gi,"")}
		    })
			     });
		} else {
		    // Text version.  Format is much more stable than the HTML version		    
		    returnfn({date: msg.date, accounts: currentChunk.substring(currentChunk.match(/Your Accounts/).index,currentChunk.match(/Your Top Purchases/).index).match(/\*[^\r\/]*/gi).map(function(x){
			return {account: accountnamereplace(x.split(":")[0].replace('*','').trim()), value: x.split(":")[1].replace(/[ ,\$\-]/gi,'')}	
		    })
			     });
		    
		    
		}

	    });
	});
	fetch.on('end', function() {
	    console.log('Done fetching all messages!');
	    imap.logout(cb);
	    endfn();
	});
    }
];

