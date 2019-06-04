require('../utils/hooks');
const assert = require('assert');
const Hydro = artifacts.require('./Hydro.sol');
const TestToken = artifacts.require('./helper/TestToken.sol');

const { createAssets } = require('../utils/assets');
const { toWei, pp, getUserKey } = require('../utils');
const { buildOrder } = require('../utils/order');

contract('Margin', accounts => {
    let hydro;

    before(async () => {
        hydro = await Hydro.deployed();
    });

    const relayer = accounts[9];

    const u1 = accounts[4];
    const u2 = accounts[5];
    const u3 = accounts[6];

    const showLoans = (loans, indentation = 0) => {
        const ind = ' '.repeat(indentation);
        loans.forEach(l => {
            console.log(`${ind}id`, l.id);
            console.log(`${ind}assetID`, l.assetID);
            console.log(`${ind}collateralAccountID`, l.collateralAccountID);
            console.log(`${ind}startAt`, l.startAt);
            console.log(`${ind}expiredAt`, l.expiredAt);
            console.log(`${ind}interestRate`, l.interestRate);
            console.log(`${ind}source`, l.source);
            console.log(`${ind}amount`, l.amount);
        });
    };

    const showCollateralAccountDetails = (account, indentation = 0) => {
        const ind = ' '.repeat(indentation);
        console.log(`${ind}Account:`);
        console.log(`${ind}liquidable`, account.liquidable);
        console.log(`${ind}collateralAssetAmounts`, account.collateralAssetAmounts);
        console.log(`${ind}collateralsTotalUSDlValue`, account.collateralsTotalUSDlValue);
        console.log(`${ind}loanValues`, account.loanValues);
        console.log(`${ind}loansTotalUSDValue`, account.loansTotalUSDValue);
        console.log(`${ind}loans:`);
        showLoans(account.loans, indentation + 2);
    };

    const showStatus = async () => {
        const assetCount = (await hydro.getAllAssetsCount()).toNumber();
        console.log('assetCount:', assetCount);
        // const getBalanceOf = () =>
        const users = [u1, u2, u3, relayer];

        for (let i = 0; i < assetCount; i++) {
            const assetInfo = await hydro.getAssetInfo(i);

            let symbol;
            if (assetInfo.tokenAddress == '0x0000000000000000000000000000000000000000') {
                symbol = 'ETH';
            } else {
                const token = await TestToken.at(assetInfo.tokenAddress);
                symbol = await token.symbol();
            }

            // await hydro.balanceOf(u1);
            for (let j = 0; j < users.length; j++) {
                const balance = await hydro.balanceOf(i, users[j]);
                console.log(`User ${getUserKey(users[j])} ${symbol} balance:`, balance.toString());
            }
        }

        const collateralAccountsCount = (await hydro.getCollateralAccountsCount()).toNumber();

        for (let i = 0; i < collateralAccountsCount; i++) {
            const details = await hydro.getCollateralAccountDetails(i);
            showCollateralAccountDetails(details);
        }
    };

    it('open margin', async () => {
        const [baseToken, quoteToken] = await createAssets([
            {
                symbol: 'ETH',
                name: 'ETH',
                decimals: 18,
                oraclePrice: toWei('500'),
                collateralRate: 15000,
                initBalances: {
                    [u1]: toWei('10'),
                    [u2]: toWei('1')
                }
            },
            {
                symbol: 'USD',
                name: 'USD',
                decimals: 18,
                oraclePrice: toWei('1'),
                collateralRate: 15000,
                initBalances: {
                    [u1]: toWei('1000')
                },
                initPool: {
                    [u1]: toWei('1000')
                }
            }
        ]);

        const openMarginRequest = {
            borrowAssetID: 1, // USD
            collateralAssetID: 0, // ETH
            maxInterestRate: 65535,
            minExpiredAt: 3500000000,
            liquidationRate: 120,
            expiredAt: 3500000000,
            trader: u2,
            minExchangeAmount: toWei('1'),
            borrowAmount: toWei('300'),
            collateralAmount: toWei('1'),
            nonce: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        };

        const exchangeParams = {
            takerOrderParam: await buildOrder(
                {
                    trader: u2,
                    relayer,
                    version: 2,
                    side: 'buy',
                    type: 'market',
                    expiredAtSeconds: 3500000000,
                    asMakerFeeRate: 0,
                    asTakerFeeRate: 0,
                    baseTokenAmount: toWei('0'),
                    quoteTokenAmount: toWei('300'),
                    gasTokenAmount: toWei('0')
                },
                baseToken.address,
                quoteToken.address
            ),
            makerOrderParams: [
                await buildOrder(
                    {
                        trader: u1,
                        relayer,
                        version: 2,
                        side: 'sell',
                        type: 'limit',
                        expiredAtSeconds: 3500000000,
                        asMakerFeeRate: 0,
                        asTakerFeeRate: 0,
                        baseTokenAmount: toWei('3'),
                        quoteTokenAmount: toWei('300'),
                        gasTokenAmount: toWei('0')
                    },
                    baseToken.address,
                    quoteToken.address
                )
            ],
            baseTokenFilledAmounts: [toWei('3')],
            orderAddressSet: {
                baseToken: baseToken.address,
                quoteToken: quoteToken.address,
                relayer
            }
        };
        await showStatus();
        const res = await hydro.openMargin(openMarginRequest, exchangeParams, { from: relayer });
        console.log(`        1 Orders, Gas Used:`, res.receipt.gasUsed);
        await showStatus();
    });
});
