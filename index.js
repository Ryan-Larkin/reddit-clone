var express = require('express');
var mysql = require('promise-mysql');

// Express middleware
var bodyParser = require('body-parser'); // reads request bodies from POST requests
var cookieParser = require('cookie-parser'); // parses cookie from Cookie request header into an object
var morgan = require('morgan'); // logs every request on the console
var checkLoginToken = require('./lib/check-login-token.js'); // checks if cookie has a SESSION token and sets request.user
var onlyLoggedIn = require('./lib/only-logged-in.js'); // only allows requests from logged in users

// Controllers
var authController = require('./controllers/auth.js');

/*
 Load the RedditAPI class and create an API with db connection. This connection will stay open as
 long as the web server is running, which is 24/7.
 */
var RedditAPI = require('./lib/reddit.js');
var connection = mysql.createPool({
    user: 'root',
    database: 'reddit'
});
var myReddit = new RedditAPI(connection);


// Create a new Express web server
var app = express();

// Specify the usage of the Pug template engine
app.set('view engine', 'pug');

/*
 This next section specifies the middleware we want to run.
 app.use takes a callback function that will be called on every request
 the callback function will receive the request object, the response object, and a next callback.
 this type of function is called a "middleware".
 express will run these middleware in a pipeline, one after the other on each request.
 the order the middleware are declared in is important. for example, the cookieParser middleware will
 add a .cookie property to the request object. the checkLoginToken middleware will then use request.cookie
 to check if a user is logged in. this means cookieParser needs to run before checkLoginToken.
 */

// This middleware will log every request made to your web server on the console.
app.use(morgan('dev'));

// This middleware will parse the POST requests coming from an HTML form, and put the result in request.body.
app.use(bodyParser.urlencoded({extended: false}));

// This middleware will parse the Cookie header from all requests, and put the result in request.cookies as an object.
app.use(cookieParser());

/*
This custom middleware checks in the cookies if there is a SESSION token and validates it.

NOTE: This middleware is currently commented out! Uncomment it once you've implemented the RedditAPI
method `getUserFromSession`
 */
app.use(checkLoginToken(myReddit));





/*
app.use can also take a path prefix as a parameter. the next app.use says that anytime the request URL
starts with /auth, the middleware exported by controllers/auth.js should be called.

this type of middleware is a common way to modularize code in an Express application. basicaly we're
saying that any URL under /auth has to do with authentication, and we put all the sub-routes in their
own file to prevent clutter and improve maintainability.

the file at controllers/auth.js contains what is called an Express Router. a Router is like a tiny
express application that takes care of its own set of paths. look at the file for more information.

The authController needs access to the RedditAPI to do its work, so we pass it as a parameter and the
controller gets returned from that function.
 */
app.use('/auth', authController(myReddit));

/*
 This next middleware will allow us to serve static files, as if our web server was a file server.
 To do this, we attach the middleware to the /static URL path. This means any URL that starts with
 /static will go thru this middleware. We setup the static middleware to look for files under the public
 directory which is at the root of the project. This basically "links" the public directory to a URL
 path called /static, and any files under /public can be requested by asking for them with /static
 followed by the path of those files.

 If you look in views/layout.pug, you'll see that we add a <link> tag referencing /static/app.css.
 This is a CSS file that is located in the public directory. For now the file is mostly empty, but
 you can add stuff to it if you want to make your site look better.

 Eventually you could also load browser JavaScript and make your site more dynamic. We will be looking
 at how to do this in the next few weeks but don't hesitate to take a head start.
 */
app.use('/static', express.static(__dirname + '/public'));

// Regular home Page
app.get('/', (request, response) => {
    myReddit.getAllPosts()
    //.then(result => console.log(result))
    .then(posts =>  response.render('post-list', {posts: posts}))
    .catch(error => response.render('error', {error: error}));
});

// Listing of subreddits
app.get('/subreddits', function(request, response) {
    myReddit.getAllSubreddits()
    .then(allSubreddits => {
        response.render('subreddits-list', {subreddits: allSubreddits});
    })
    
});

// 1 gets all posts from the address bar
// 2 gets the id from the get getSubredditByName which returns an object with id and name
// 3 gets all the post for the requested id with the getAllPosts function
// 4 renders the posts object to html with pug and sends it to the page
app.get('/r/:subreddit/:method*?', (request, response) => {
    var x = "top";
    var isModerator = false;
    if(request.params.method === "hot" ||request.params.method ==="top") { x = request.params.method}
     myReddit.getSubredditByName(request.params.subreddit)
     .then(result => {
        //request.loggedInUser.id === result.moderatorId ? isModerator = true : isModerator = false;
        return myReddit.getAllPosts(x, result.id);
     })
     .then(posts => response.render('reddit-post-list', {posts: posts, subredditName: request.params.subreddit, isModerator})
     );
});


app.get('/u/:username/:method*?', (request, response) => {
    var x = "top";
    if(request.params.method === "hot" ||request.params.method ==="top") {
         x = request.params.method;
    }
    myReddit.getAllPostsForUsername(request.params.username, x)
    .then(posts => response.render('user-post-list', {posts: posts, username: request.params.username}));
    
});




// Sorted home page
app.get('/sort/:method', function(request, response) {
    if(request.params.method === "hot" ||request.params.method ==="top"){
        return myReddit.getAllPosts(request.params.method)
        .then(function(posts){
            response.render('post-list', {posts: posts});
        });
    }
    else{
        response.status(404);
    }
    
});

app.get('/post/:postId', function(request, response) {
    //check if postId contains letters, if it does then send it to the 404 error page.
    if (request.params.postId.match(/[a-z]/i)) {
        response.render('error', {error: {message: "404, PAGE NOT FOUND", stack: 'Post does not exist'}});
    }
    else {
        Promise.all([myReddit.getSinglePost(request.params.postId), myReddit.getCommentsForPost(request.params.postId)])
        .then(function(arrayOfFutureValues){
            var post = arrayOfFutureValues[0];
            if(post.id) {
                response.render('single-post', {post: post, // post object
                                                comments: arrayOfFutureValues[1]}); // comment object
            }
            else {
                response.render('error', {error: {message: "404, PAGE NOT FOUND", stack: 'Post does not exist'}});
            }
        })
        .catch(e => console.log(e));
    }
});



app.post('/vote', onlyLoggedIn, (request, response) => {
    return Promise.all([myReddit.getUserFromSession(request.cookies.SESSION), request.body])
    .then(result => {    
        return { postId : Number(result[1].postId),
                     userId : result[0].id,
                     voteDirection: Number(result[1].vote) };
    })
    .then(result => {
      return  myReddit.createVote(result);
    })
    .then(result => {
        response.redirect(`${request.header('Referer')}`);
    })
    .catch(e => console.log(e));
});

app.post('/deletePost', onlyLoggedIn, (request, response) => {
    myReddit.deletePost(request.body)
    .then(result =>  response.redirect(`${request.header('Referer')}`));
});
  // request.body = { postId: '52', deletePost: 'true' }  


// This handler will send out an HTML form for creating a new post
app.get('/createPost', onlyLoggedIn, function(request, response) {
    myReddit.getAllSubreddits()
    .then(allSubreddits => {
        response.render('create-post-form', {subreddits: allSubreddits});
    });
});

// POST handler for form submissions creating a new post
app.post('/createPost', onlyLoggedIn, function(request, response) {
        var p1 = myReddit.getUserFromSession(request.cookies.SESSION);
        var p2 = myReddit.getSubredditByName(request.body.subreddit);
        
        return Promise.all([p1,p2])
        .then(values => {
            // set these values to null by default
            // later on we'll populate the relevant one with data returned by the appropriate form input
            var postUrl = null;
            var postText = null;
            
            // Check which one of these is present, and set the appropriate variable to that value
            // Should only ever have one of these
            if (request.body.url !== undefined) {
                postUrl = request.body.url;
            }
            else { // If the url isn't set, that means the postText is set
                postText = request.body.postText;
            }
            return myReddit.createPost({
                userId: values[0].id, // p1 was the first promise, which returned a user object, so values[0].id will return the user id
                title: request.body.title, // title entered in the form
                url: postUrl, // either null or the url entered from the form
                postText: postText, // either null or the post text entered from the form
                subredditId: values[1].id // p2 was the second promise, which returned a subreddit object, so values[1].id will return the subreddit id
            });
        })
        .then(post => { // this returns the post id from the previous promise, which is the currently created post
            response.redirect(`/post/${post}`);
        })
        .catch(error => {
            throw error;
        });
});

    app.get('/test', (request, response) => {
        console.log(request.loggedInUser);
    });
    
    app.post('/createComment', onlyLoggedIn,function(request,response){
        return Promise.all([myReddit.getUserFromSession(request.cookies.SESSION),request.body])
         .then(function(result){
             
             return {
                      userId : result[0].id,
                      postId : result[1].postId,
                      text: result[1].comment
             };
         }).then(function (result){
             myReddit.createComment(result);
         }).then(result => {
        response.redirect(`${request.header('Referer')}`);
    });
        
    });
  

 app.post('/commentVote', onlyLoggedIn, function(request, response) {
     return Promise.all([myReddit.getUserFromSession(request.cookies.SESSION), request.body])
         .then(function(result) {
 
             return {
                 commentId: result[1].commentId,
                 userId: result[0].id,
                 voteDirection: Number(result[1].vote)
 
             };
         }).then(function(result) {
               myReddit.createCommentVote(result);
         })
         .then(function(result){
             response.redirect(`${request.header('Referer')}`);
         });
 
 });
    





// Listen
var port = process.env.PORT || 3000;
app.listen(port, function() {
    // This part will only work with Cloud9, and is meant to help you find the URL of your web server :)
    if (process.env.C9_HOSTNAME) {
        console.log('Web server is listening on https://' + process.env.C9_HOSTNAME);
    }
    else {
        console.log('Web server is listening on http://localhost:' + port);
    }
});

    
