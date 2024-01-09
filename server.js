const express = require('express')
require('dotenv').config()
const app = express()
const cors = require('cors');
const { sign, verify } = require('jsonwebtoken')

const categories = process.env.REACT_APP_CATEGORIES.split(',');
const secretKey = process.env.JWT_SECRET

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(cors({
    origin: [process.env.FRONTEND_URL, 'http://localhost:3000'],
    credentials: true,
}))

app.listen(process.env.PORT || 8080, (err) => {
    console.log(`server listening on ${process.env.PORT || 8080}`)
})

const db = require('knex')({
    client: 'pg',
    version: '7.2',
    connection: {
        host: 'surus.db.elephantsql.com',
        user: 'keocaula',
        password: '51Ne1PfJRG0auTdAIVVh7-A8i4TCa2se',
        database: 'keocaula',
    }
});

const users = [
    {
        id: 1,
        username: 'Admin',
        password: process.env.ADMIN_PASSWORD,
    }
]

const verifyToken = (req, res, next) => {
    if (!req.headers.cookie) {
        return res.status(403).json({ message: 'No cookies found' });
    }

    const cookies = req.headers.cookie.split(';');

    let token = null;
    for (const cookie of cookies) {
        const trimmedCookie = cookie.trim();
        const parts = trimmedCookie.split('=');
        if (parts.length === 2 && parts[0] === 'access-token') {
            token = parts[1];
            break; // Found access-token, exit loop
        }
    }

    if (!token) {
        return res.status(403).json({ message: 'Token not provided' });
    }

    verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Failed to authenticate token' });
        }

        req.decoded = decoded;
        next();
    });
};

var checkRoute = function (req, res, next) {
    if (req._parsedUrl.pathname === '/login') {
        next();
    } else {
        verifyToken(req, res, next)
    }
}

app.use(checkRoute)

app.get('/', (req, res) => {
    res.send({
        ok: true,
        message: 'connection established',
        username: req.decoded.username
    })

});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(
        (u) => u.username === username && u.password === password
    );

    if (user) {

        const token = sign({ id: user.id, username: user.username }, secretKey, {
            expiresIn: '1h',
        });
        res.cookie('access-token', token, {
            maxAge: 60 * 60 * 24 * 7 * 1000,
            sameSite: false,
        })
        res.status(200).send({
            'ok': true,
            'message': 'User successfully logged in',
        });
    } else {
        res.status(401).json({
            ok: false,
            message: 'Invalid username or password'
        });
    }
});

app.post('/clients', async function (req, res) {
    try {
        await db.transaction(async (trx) => {
            const existing_client = await trx
                .select('client_id', 'client_name')
                .from('clients')
                .where({ client_name: req.body.client_name })

            if (existing_client.length > 0) {
                return res.status(400).send({
                    ok: false,
                    message: 'This client name already exist.',
                })
            }

            const new_client = await trx('clients').insert({
                client_name: req.body.client_name,
            }).returning('*')

            await trx.commit();
            res.status(200).send({
                ok: true,
                new_client: new_client[0],
            });
        });
    } catch (error) {
        console.log(error);
        res.status(500).send({
            'ok': false,
            'error': error
        });
    }
});

app.put('/clients/', async function (req, res) {
    try {
        await db.transaction(async (trx) => {
            const existing_client = await trx
                .select('client_id', 'client_name')
                .from('clients')
                .where({ client_id: req.body.client_id })

            if (existing_client.length == 0) {
                return res.status(400).send({
                    ok: false,
                    message: 'client name does not exist.',
                })
            }

            const new_client = await trx('clients')
                .where({ client_id: req.body.client_id })
                .update({ client_name: req.body.client_name }, ['client_name'])
                .returning('*')


            await trx.commit();
            res.status(200).send({
                ok: true,
                ...new_client[0],
            });
        });
    } catch (error) {
        console.log(error);
        res.status(500).send({
            'ok': false,
            'error': error
        });
    }
});

app.get('/clients', async function (req, res) {
    try {
        const clients = await db.select('*').from('clients')
        res.status(200).send({
            'ok': true,
            'client_list': clients
        });
    } catch (error) {
        res.status(500).send({
            'ok': false,
            'error': error
        });
    }
});

app.get('/client/:client_id', async function (req, res) {
    await db.transaction(async (trx) => {
        const existing_client = await trx
            .select('client_id', 'client_name')
            .from('clients')
            .where({ client_id: req.params.client_id })

        if (existing_client.length < 0) {
            return res.status(400).send({
                ok: false,
                message: 'client name does not exist.',
            })
        }
        const ratings = await trx
            .select(categories)
            .from('ratings')
            .where({ "client_id": req.params.client_id })

        const newRatings = ratings.map((element) => {
            const date = element.rating_date
            delete element.rating_date

            return {
                'date': date,
                'values': element
            }
        })

        await trx.commit();
        return res.status(200).send({
            ok: true,
            'client_id': existing_client[0].client_id,
            'client_name': existing_client[0].client_name,
            'ratings': newRatings

        });
    });
});

app.delete('/client/:client_id', async function (req, res) {
    await db.transaction(async (trx) => {
        const existing_client = await trx
            .select('client_id', 'client_name')
            .from('clients')
            .where({ client_id: req.params.client_id })

        if (existing_client.length < 0) {
            return res.status(400).send({
                ok: false,
                message: 'client name does not exist.',
            })
        }
        await trx
            .from('ratings')
            .where({ "client_id": req.params.client_id })
            .del()

        const client = await trx
            .from('clients')
            .where({ "client_id": req.params.client_id })
            .del()
            .returning('*')
        await trx.commit();
        return res.status(200).send({
            ok: true,
            client_name: client[0].client_name,
        });
    });
});

app.get('/ratings/:client_id', async function (req, res) { //get all ratings for this client
    await db.transaction(async (trx) => {
        const existing_client = await trx
            .select('*')
            .from('clients')
            .where({ client_id: req.params.client_id })


        if (existing_client.length < 0) {
            return res.status(400).send({
                ok: false,
                message: 'rating does not exist.',
            })
        }

        const ratings = await trx
            .select('rating_id', ...categories, 'rating_date', 'client_name')
            .from('ratings')
            .where({ "clients.client_id": req.params.client_id })
            .leftJoin('clients', 'ratings.client_id', 'clients.client_id')

        await trx.commit();
        return res.status(200).send({
            ok: true,
            ratings: ratings,
        });
    });
});

app.get('/rating/:rating_id', async function (req, res) { //get a specific rating 
    await db.transaction(async (trx) => {
        const existing_rating = await trx
            .select('*')
            .from('ratings')
            .where({ rating_id: req.params.rating_id })


        if (existing_rating.length == 0) {
            return res.status(400).send({
                ok: false,
                message: 'rating does not exist.',
            })
        }

        const ratings = await trx
            .select('rating_id', ...categories, 'rating_date', 'client_name')
            .from('ratings')
            .where({ "ratings.rating_id": req.params.rating_id })
            .leftJoin('clients', 'ratings.client_id', 'clients.client_id')

        await trx.commit();
        return res.status(200).send({
            ok: true,
            data: {
                ...ratings[0],
                client_id: existing_rating[0].client_id
            }
        });
    });
});

app.post('/ratings', async function (req, res) {
    try {
        await db.transaction(async (trx) => {
            const existing_rating = await trx
                .select(...categories, 'rating_date', 'client_name')
                .from('ratings')
                .innerJoin('clients', 'ratings.client_id', 'clients.client_id')
                .where({ 'clients.client_id': req.body.client_id, rating_date: req.body.rating_date })

            if (existing_rating.length > 0) {
                console.log(existing_rating)
                return res.status(400).send({
                    ok: false,
                    message: 'rating for this date already exists.',
                })
            }

            const new_rating_data = {
                rating_date: req.body.rating_date,
                client_id: req.body.client_id
            };

            categories.forEach(category => {
                new_rating_data[category] = req.body[category];
            });

            const new_rating = await trx('ratings')
                .insert(new_rating_data)
                .returning('*');

            await trx.commit();
            res.status(200).send({
                ok: true,
                new_rating: new_rating[0],
            });
        });
    } catch (error) {
        console.log(error);
        res.status(500).send({
            'ok': false,
            'error': error
        });
    }
});

app.put('/ratings/', async function (req, res) {
    try {
        console.log(req.body)
        await db.transaction(async (trx) => {
            const existing_rating = await trx
                .select(...categories, 'rating_date', 'client_name')
                .from('ratings')
                .where({ rating_id: req.body.rating_id })
                .leftJoin('clients', 'ratings.client_id', 'clients.client_id')

            if (existing_rating.length == 0) {
                return res.status(400).send({
                    ok: false,
                    message: 'rating does not exist.',
                })
            }

            const new_rating_data = {
                client_id: req.body.client_id,
                rating_date: req.body.rating_date
            };

            categories.forEach(category => {
                new_rating_data[category] = req.body[category];
            });

            const new_rating = await trx('ratings')
                .where({ rating_id: req.body.rating_id })
                .update(new_rating_data)
                .returning('*')

            await trx.commit();
            res.status(200).send({
                ok: true,
                ...new_rating[0],
                client_name: existing_rating[0].client_name
            });
        });
    } catch (error) {
        console.log(error);
        res.status(500).send({
            'ok': false,
            'error': error
        });
    }
});

app.delete('/rating/:rating_id', async function (req, res) {
    await db.transaction(async (trx) => {
        const existing_client = await trx
            .select('rating_id')
            .from('ratings')
            .where({ rating_id: req.params.rating_id })

        if (existing_client.length === 0) {
            return res.status(400).send({
                ok: false,
                message: 'client name does not exist.',
            })
        }

        const deleted = await trx
            .from('ratings')
            .where({ "rating_id": req.params.rating_id })
            .del()
            .returning('*')
        await trx.commit();
        return res.status(200).send({
            ok: true,
            deleted: deleted
        });
    });
});
