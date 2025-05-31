#!/usr/bin/env python
# encoding: utf-8

from flask import Flask, request, jsonify
import random
import sys
from core import (
    gen_jwt_proof,
)
import logging

app = Flask(__name__)

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy"})

@app.route("/prove/jwt", methods=["POST"])
def prove_jwt():
    print("jwt")
    req = request.get_json()
    input = req["input"]
    logger = logging.getLogger(__name__)
    logger.info(req)
    print(req)
    nonce = random.randint(
        0,
        sys.maxsize,
    )
    logger.info(nonce)
    print(nonce)
    proof = gen_jwt_proof(str(nonce), False, input)
    logger.info(proof)
    print(proof)
    return jsonify(proof)


if __name__ == "__main__":
    from waitress import serve

    port = 8080
    logger = logging.getLogger(__name__)
    logger.info(f"Starting server on port {port}")
    print(f"Starting server on port {port}")
    serve(app, host="0.0.0.0", port=port)
