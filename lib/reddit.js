"use strict";

var bcrypt = require('bcrypt-as-promised');
var HASH_ROUNDS = 10;

var emoji = require('node-emoji');
var marked = require('marked');
var domain = 'sandboxb153a08035544b179f6f884582ee5fe4.mailgun.org';
var api_key = 'key-320bb84969aba0ef30c828c4737a44f5';
var mailgun = require('mailgun-js')({apiKey: api_key, domain: domain});

// This is a helper function to map a flat post to nested post
function transformPost(post) {
    return {
        id: post.posts_id,
        title: emoji.emojify(post.posts_title),
        url: post.posts_url,
        postText: post.posts_postText !== null ? marked(emoji.emojify(post.posts_postText)) : null,
        isImage: post.posts_url !== null ? checkURL(post.posts_url) : null,
        createdAt: post.posts_createdAt,
        updatedAt: post.posts_updatedAt,
        voteScore: post.voteScore,
        numUpvotes: post.numUpvotes,
        numDownvotes: post.numDownvotes,

        user: {
            id: post.users_id,
            username: post.users_username,
            createdAt: post.users_createdAt,
            updatedAt: post.users_updatedAt
        },
        subreddit: {
            id: post.subreddits_id,
            name: post.subreddits_name,
            description: post.subreddits_description ? marked(emoji.emojify(post.subreddits_description)) : null,
            createdAt: post.subreddits_createdAt,
            updatedAt: post.subreddits_updatedAt
        }
    };
}



function checkURL(url){
    if( url.endsWith(".gif"))
      return true;
    if (url.endsWith(".png"))
      return true;
    if (url.endsWith(".jpg"))
      return true;
    else
       return false;
}

class RedditAPI {
    constructor(conn) {
        this.conn = conn;
    }

    /*
    user should have username and password
     */
    createUser(user) {
        /*
         first we have to hash the password. we will learn about hashing next week.
         the goal of hashing is to store a digested version of the password from which
         it is infeasible to recover the original password, but which can still be used
         to assess with great confidence whether a provided password is the correct one or not
         */
        return bcrypt.hash(user.password, HASH_ROUNDS)
        .then(hashedPassword => {
            return this.conn.query('INSERT INTO users (username, password,email, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())', [user.username, hashedPassword,user.email]);
        })
        .then(result => {
            return result.insertId;
        })
        .catch(error => {
            // Special error handling for duplicate entry
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('A user with this username already exists');
            }
            else {
                throw error;
            }
        });
    }

    /*
    post should have userId, title, url, subredditId
     */
    createPost(post) {
        if (!post.subredditId) {
            return Promise.reject(new Error("There is no subreddit id"));
        }
        
        // Need to make sure the url starts with https:// so check if it starts with that.
        // If it doesn't, then we need to make it start with it, before we put it into the mysql query
        var postUrl = "";
        
        if (post.url) {
            if(post.url.startsWith('https://') || post.url.startsWith('http://')) {
                postUrl = post.url;
            }
            else {
                postUrl = 'https://' + post.url;
            }
        }
        
        // Once the url will for sure be what we want, we can put it into the query and insert the post into the database
        return this.conn.query(
            `
            INSERT INTO posts (userId, title, url, createdAt, updatedAt, subredditId, postText)
            VALUES (?, ?, ?, NOW(), NOW(), ?, ?)`,
            [post.userId, post.title, postUrl, post.subredditId, post.postText]
        )
        .then(result => {
            return result.insertId;
        })
        .catch((e) => console.log('error', e));
    }
    
    deletePost(post) {
        return this.conn.query(`DELETE FROM posts WHERE id = ${post.postId}`);
    }
    
    
    getAllPosts(sortingMethod, subredditId) {
        var x = "";
        var y = 'ORDER BY p.createdAt DESC';
        
        if(sortingMethod==="top"){
            y = 'ORDER BY voteScore DESC';
        }
        else if(sortingMethod ==="hot"){
            y ='ORDER BY hotScore DESC';
        }
        
        if(subredditId) {
             x = `WHERE p.subredditId = ${subredditId}`;
            // the idea is that if subredditId is defined we will pass it into the var x and then pass it 
            // inside the query. if it is not defined, the query is an empty string not affecting the original query
        }
                return this.conn.query(
                    `
                    SELECT
                        p.id AS posts_id,
                        p.title AS posts_title,
                        p.url AS posts_url,
                        p.postText AS posts_postText,
                        p.createdAt AS posts_createdAt,
                        p.updatedAt AS posts_updatedAt, 
                        
                        u.id AS users_id,
                        u.username AS users_username,
                        u.createdAt AS users_createdAt,
                        u.updatedAt AS users_updatedAt,
                        
                        s.id AS subreddits_id,
                        s.name AS subreddits_name,
                        s.description AS subreddits_description,
                        s.createdAt AS subreddits_createdAt,
                        s.updatedAt AS subreddits_updatedAt,
                        
                        COALESCE(SUM(v.voteDirection), 0) AS voteScore,
                        SUM(IF(v.voteDirection = 1, 1, 0)) AS numUpvotes,
                        SUM(IF(v.voteDirection = -1, 1, 0)) AS numDownvotes,
                        COALESCE(SUM(v.voteDirection), 0) / (NOW() - p.createdAt) AS hotScore
                        
                    FROM posts p
                        JOIN users u ON p.userId = u.id
                        JOIN subreddits s ON p.subredditId = s.id
                        LEFT JOIN votes v ON p.id = v.postId
                    ${x}    
                    GROUP BY p.id
                    ${y}
                    LIMIT 25`
                )
                .then(posts => {
                    return posts.map(transformPost);
                });
    }


    // Similar to previous function, but retrieves one post by its ID
    getSinglePost(postId) {
        console.log(postId)
        return this.conn.query(
            `
            SELECT
                p.id AS posts_id,
                p.title AS posts_title,
                p.url AS posts_url,
                p.postText AS posts_postText,
                p.createdAt AS posts_createdAt,
                p.updatedAt AS posts_updatedAt,
                p.postText AS posts_postText,
                
                u.id AS users_id,
                u.username AS users_username,
                u.createdAt AS users_createdAt,
                u.updatedAt AS users_updatedAt,
                
                s.id AS subreddits_id,
                s.name AS subreddits_name,
                s.description AS subreddits_description,
                s.createdAt AS subreddits_createdAt,
                s.updatedAt AS subreddits_updatedAt,
                
                COALESCE(SUM(v.voteDirection), 0) AS voteScore,
                SUM(IF(v.voteDirection = 1, 1, 0)) AS numUpvotes,
                SUM(IF(v.voteDirection = -1, 1, 0)) AS numDownvotes
                
            FROM posts p
                JOIN users u ON p.userId = u.id
                JOIN subreddits s ON p.subredditId = s.id
                LEFT JOIN votes v ON p.id = v.postId
                
            WHERE p.id = ?`,
            [postId]
        )
        .then(function(posts) {
            if (posts.length === 0) {
                return null;
            }
            else {
                return transformPost(posts[0]);
            }
        });
    }

    /*
    subreddit should have name and optional description
     */
    createSubreddit(subreddit) {
        return this.conn.query(
            `INSERT INTO subreddits (name, description, createdAt, updatedAt)
            VALUES(?, ?, NOW(), NOW())`, [subreddit.name, subreddit.description])
        .then(function(result) {
            return result.insertId;
        })
        .catch(error => {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('A subreddit with this name already exists');
            }
            else {
                throw error;
            }
        });
    }
    
   getAllSubreddits() {
        return this.conn.query(`
            SELECT id, name, description, createdAt, updatedAt
            FROM subreddits ORDER BY createdAt DESC`
        );
    }
    
    
// First, we have to go from subreddit name to subreddit ID. 
// Create a RedditAPI function called getSubredditByName(name). 
// This should make a query to the database, and return a subreddit object that matches the given name.
// If no subreddit was found, the promise should resolve with null.
    
    getSubredditByName(name) {
        return this.conn.query(`
            SELECT *
            FROM subreddits
            WHERE name = ?`,
            name)
            .then(result => {
                return { id : result[0].id,
                         name: result[0].name,
                         moderatorId : result[0].moderatorId
                        };
                        
           })
           .catch(result => {
               return null;
           });
    }

    /*
    vote must have postId, userId, voteDirection
     */
    createVote(vote) {
        if (vote.voteDirection !== 1 && vote.voteDirection !== -1 && vote.voteDirection !== 0) {
            return Promise.reject(new Error("voteDirection must be one of -1, 0, 1"));
        }

        return this.conn.query(`
            INSERT INTO votes (postId, userId, voteDirection)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE voteDirection = ?`,
            [vote.postId, vote.userId, vote.voteDirection, vote.voteDirection]
        );

    }

    /*
    comment must have userId, postId, text
     */
    createComment(comment) {
        return this.conn.query(`
            INSERT INTO comments (userId, postId, text, createdAt, updatedAt)
            VALUES (?, ?, ?, NOW(), NOW())`,
            [comment.userId, comment.postId, comment.text]
        )
        .then(result => {
            return result.insertId;
        });
        
    }

    getCommentsForPost(postId) {
        return this.conn.query(`
            SELECT
                c.id as comments_id,
                c.text as comments_text,
                c.createdAt as comments_createdAt,
                c.updatedAt as comments_updatedAt,
                
                u.id as users_id,
                u.username as users_username
                
            FROM comments c
                LEFT JOIN users u ON c.userId = u.id
                
            WHERE c.postId = ?
            ORDER BY c.createdAt DESC
            LIMIT 25`,
            [postId]
        ) 
        .then(function(results) {
            return results.map(function(result) {
                return {
                    id: result.comments_id,
                    text: marked(emoji.emojify(result.comments_text)),
                    createdAt: result.comments_createdAt,
                    updatedAt: result.comments_updatedAt,

                    user: {
                        id: result.users_id,
                        username: result.users_username
                    }
                };
            });
        })
        .catch((e) => console.log('e', e))
    }

    checkUserLogin(username, password) {
        return this.conn.query(`
            SELECT id, username, password, createdAt, updatedAt
            FROM users
            WHERE username=?`, [username]) // Search for username
            .then(users => {
                return bcrypt.compare(password, users[0].password) // Compare inputted password with database password
                .then(response => { // If everything matches, return the user's info.
                    return {
                        id: users[0].id,
                        username: users[0].username,
                        createdAt: users[0].createdAt,
                        updatedAt: users[0].updatedAt
                    };
                });
            }).catch(error => {
                throw new Error("Username or password incorrect."); // If an error ever hapens, just say the username or passwod is incorrect.
            });
  
    }

    createUserSession(userId) {
        var token;
        return bcrypt.genSalt(HASH_ROUNDS)
        .then(salt => {
            token = salt;
            return this.conn.query(`INSERT INTO sessions (userId, token) VALUES (?, ?)`, [userId, salt]); // Insert the userId and token into the sessions table.
        })
        .then(result => {
            return token;
        }).catch(error => {
            throw error;
        });
        
        /*
        Here are the steps you should follow:

        1. Use bcrypt's genSalt function to create a random string that we'll use as session id (promise)
        2. Use an INSERT statement to add the new session to the sessions table, using the input userId
        3. Once the insert is successful, return the random session id generated in step 1
        */
    }

    getUserFromSession(sessionId) {
        return this.conn.query(`
        SELECT 
            u.id AS UserId,
            u.username AS Username, 
            u.password AS Password, 
            u.createdAt AS UserCreation, 
            u.updatedAt AS UserUpdate
        FROM users u
        INNER JOIN sessions s ON u.id = s.userId
        WHERE s.token = ?`, [sessionId])
        .then(users => { // this should only ever return a max of 1 user so we can just use users[0] to refer to it
            return {
                id: users[0].UserId,
                username: users[0].Username,
                password: users[0].Password,
                createdAt: users[0].UserCreation,
                updatedAt: users[0].UserUpdate
            };
        });
    }
    
    removeSession(sessionToken) {
        return this.conn.query(`
        DELETE FROM sessions
        WHERE token = ?`, [sessionToken]);
    }
    
    getAllPostsForUsername(user, sortingMethod) {
        var y = 'ORDER BY p.createdAt DESC';
        if(sortingMethod==="top"){
            y = 'ORDER BY voteScore DESC';
        }
        else if(sortingMethod ==="hot"){
            y ='ORDER BY hotScore DESC';
        }
        
        return this.conn.query(`
                    SELECT
                        p.id AS posts_id,
                        p.title AS posts_title,
                        p.url AS posts_url,
                        p.postText AS posts_postText,
                        p.createdAt AS posts_createdAt,
                        p.updatedAt AS posts_updatedAt, 
                        
                        u.id AS users_id,
                        u.username AS users_username,
                        u.createdAt AS users_createdAt,
                        u.updatedAt AS users_updatedAt,
                        
                        s.id AS subreddits_id,
                        s.name AS subreddits_name,
                        s.description AS subreddits_description,
                        s.createdAt AS subreddits_createdAt,
                        s.updatedAt AS subreddits_updatedAt,
                        
                        COALESCE(SUM(v.voteDirection), 0) AS voteScore,
                        SUM(IF(v.voteDirection = 1, 1, 0)) AS numUpvotes,
                        SUM(IF(v.voteDirection = -1, 1, 0)) AS numDownvotes,
                        COALESCE(SUM(v.voteDirection), 0) / (NOW() - p.createdAt) AS hotScore
                        
                    FROM posts p
                        JOIN users u ON p.userId = u.id
                        JOIN subreddits s ON p.subredditId = s.id
                        LEFT JOIN votes v ON p.id = v.postId
                    WHERE u.username = '${user}'    
                    GROUP BY p.id
                    ${y}
                    LIMIT 25`)
        .then(result => {
            return result.map(transformPost);
        });
    }
    
    createCommentVote(vote){
        if(vote.voteDirection !== 1 && vote.voteDirection !== -1 && vote.voteDirection !==0){
            return Promise.reject(new Error("voteDirection must be one of  -1,0,1"));
        }
        return this.conn.query(`
            INSERT INTO commentvotes(commentId,userId,voteDirection)
            VALUES (?,?,?)
            ON DUPLICATE KEY UPDATE voteDirection = ?`,
            [vote.commentId,vote.userId,vote.voteDirection,vote.voteDirection]);
    }
    
    // // // checkEmail(userEmail){
    // // //     return this.conn.query(
    // // //         `
    // // //         SELECT email FROM users
    // // //         WHERE email = '${userEmail}'
            
            
            
    // //         `
    // //         );
    //     }
        createPasswordResetToken(email) {

            var userId;

            return this.conn.query(
                "SELECT * FROM users WHERE email = ?" , [email])

            .then((result) => {
                console.log(result);
                    if (result) {
                        userId = result[0].id;
                        return bcrypt.hash(Math.random().toString(), HASH_ROUNDS);

                    }
                    else {
                        Promise.reject(new Error("Invalid Email!!!"));

                    }
                })
                .then((result) => {
                    
                    this.conn.query(
                         `
                         INSERT INTO passwordResetTokens(userId,token)
                         VALUES (?,?)`,
                         [Number(userId),result]);
                        
                         return result;
                })
                .then((result) =>{
                    
                    var info={
                        from: 'Technical service <me@samples.mailgun.org>',
                        to: email,
                        subject: 'Reset your password',
                        text: 'Click this link  to reset your password https://whatever-zachfz.c9users.io/auth/resetPassword?token='.concat(result)
                        
                        
                    };
                    mailgun.messages().send(info,function(error,body){
                        console.log(body);
                    });
                    
                });
        }
        
        
         resetPassword(token, newPassword){
             return this.conn.query(
                   
                   "SELECT * FROM passwordResetTokens WHERE token =?", [token]
                 ).then((token) =>{
                     if(token){ 
                         return bcrypt.hash(newPassword, HASH_ROUNDS)
                         .then((newPassword) =>{
                             this.conn.query(
                                 
                                 "UPDATE users SET password = ? WHERE id = ?",[newPassword,token[0].userId]
                                 );
                         }).then((result) =>{
                             return this.conn.query(
                                    "DELETE FROM passwordResetTokens WHERE token =? ",[token]
                                 );
                         });
                         
                     }
                     else{
                         
                         
                     }
                     
                 });
         }
        //   return bcrypt.hash(user.password, HASH_ROUNDS)
        // .then(hashedPassword => {
        //     return this.conn.query('INSERT INTO users (username, password,email, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())', [user.username, hashedPassword,user.email]);
        // })
        // .then(result => {
        //     return result.insertId;
        // })
}

module.exports = RedditAPI;