var express = require('express');
var httpRequest = require('request-promise');

module.exports = function(myReddit) {
    var authController = express.Router();
    
    authController.get('/login', function(request, response) {
        response.render('login-form');
    });
    
    authController.post('/login', function(request, response) {
        myReddit.checkUserLogin(request.body.username, request.body.password) // checkUserLogin, if successful, will return a user object.
        .then(user => {
            return myReddit.createUserSession(user.id);
        })
        .then(token => {
            response.cookie("SESSION", token);
            response.redirect('/');
        })
        .catch(error => {
            response.status(401);
        });
    });
    
    authController.get('/signup', function(request, response) {
        response.render('signup-form');
    });
    
    authController.post('/signup', function(request, response) {
        // Google's secret key and recaptcha response
        var gSecret   = '6Lf-Gx4UAAAAAOTU_-skOMChQhyjWnUXtAGS4KKb';
        var gResponse = request.body[`g-recaptcha-response`];
        
        // Object with our secret key and captcha response
        var submission = {
            secret: gSecret, 
            response: gResponse
        };
        
        // Send the post request to Google to verify the captcha
        httpRequest.post({
            url: 'https://www.google.com/recaptcha/api/siteverify',
            formData: submission
        }) // Get the verification code
        .then(googleVerification => {
            console.log(googleVerification);
            var verification = JSON.parse(googleVerification);
            
            // return whether the verification was successful or not
            return verification.success;
        })
        .then(verificationStatus => {
        // If the verification is succesful, create a user
            if (verificationStatus) {
        // Pass the form data to the createUser function as an object. This will return a promise.
                myReddit.createUser({
                    username: request.body.username, // form username entry
                    password: request.body.password,// form password entry
                    email: request.body.email
                });
            }
            // Return whether the status was successful or not. Will only enter a user if successful.
            return verificationStatus;
        })
        .then(status => {
            // If successful, redirect user to login page. Otherwise, render an error page.
            status ? response.redirect('/auth/login') : response.render('error', {error: {message: "Recaptcha Not Verified", stack: 'Please return to the signup page.'}});
        })
        .catch(err => console.log(err)); // Redirect no matter what or check for errors here from createUser promise?
        // Upon successful user creation, the createUser promise will return the user's id. 
        // We don't need to use that data here. We just need to redirect to the login page.
    });
    
    authController.get('/logout', function(request,response) {
        myReddit.removeSession(request.cookies.SESSION)
        .then(response.clearCookie('SESSION'))
        .then(response.redirect('/'));
    });
    
    
    authController.get('/recover', function (request,response){
        
        response.render('recover-form');
        
    });
    authController.post('/createResetToken', function(request,response){
          
          myReddit.createPasswordResetToken(request.body.email)
              
              
             
    
    });
    
    authController.get('/resetPassword',function(request,response){
        console.log(request.query);
           response.render('reset-password',{token: request.query.token});
        
        
    });
    
    authController.post('/resetPAssword', function(request,response){
            myReddit.resetPassword(request.body.token,request.body.password);
        
        
    })
    
    
    return authController;
    
};

